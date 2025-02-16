import React from 'react';
import PropTypes from 'prop-types';
import {csv} from 'd3';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import {Redirect} from 'react-router-dom';
import {isMobile} from 'react-device-detect';

import {default as Section} from './Section';
import {default as QuestionInfo} from './QuestionInfo';
import {default as ScoreSummary} from './ScoreSummary';

import testTags from '../data/test-tags.json';
import testUrls from '../data/test-urls.json';

import './grade.css';
import './footer.css';

export default class Grade extends React.Component {

  constructor(props) {
    super(props);

    this.weightsCategories = ['math', 'reading', 'writing']

    this.state = {
      sections: [],
      showBlankAnswersModal: false,
      gradeAnyways: false,
      curSectionToGrade: undefined,
      curQuestionToGrade: undefined,
      suppressModal: false,
      graded: false,
      rerenderSection: '',
      math_weights: [],
      reading_weights: [],
      writing_weights: [],
      math_calc_num_answered: 0,
      math_no_calc_num_answered: 0,
      reading_num_answered: 0,
      writing_num_answered: 0,
      math_calc_num_correct: 0,
      math_no_calc_num_correct: 0,
      reading_num_correct: 0,
      writing_num_correct: 0,
      isQuestionInfoActive: false,
      questionInfoSection: 'reading',
      questionInfoIndex: 0,
      oldHighlightedElement: undefined,
      failedToLoad: false,
      pressedGradeButtonIndex: 0
    };
  }

  async componentDidMount() {
    const questionsPath = require(`../data/tests/${this.props.test}.csv`).default;
    const questions = await csv(questionsPath);
    this.setState(prevState => {
      const state = {};
      state.allQuestions = questions;
      state.sections = questions.map(d => d.section.toLowerCase().replaceAll(/[^a-z_]/g, '')).filter((value, index, self) => self.indexOf(value) === index);
      state.sections.forEach(section => {
        const numQuestions = questions.filter(d => d.section === section).length;
        state[`${section}_user_answers`] = new Array(numQuestions).fill('');
        state[`${section}_questions`] = questions.filter(d => d.section === section);
        state[`${section}_graded`] = new Array(numQuestions).fill(false);
        state[`${section}_correct`] = new Array(numQuestions).fill(false);
      });
      return state;
    });

    if(!testTags[this.props.test].hasWeights) {
      const weightsPath = require(`../data/weights/estimated.csv`).default;
      const state = {};
      const weightsData = await csv(weightsPath);
      for(const weightsCategory of this.weightsCategories) {
        state[`${weightsCategory}_weights`] = [];
        for(const weight of weightsData.filter(d => d.section === weightsCategory)) {
          state[`${weightsCategory}_weights`][weight.raw_score] = weight.weighted;
        }
      }
      this.setState(state);
    }
    else {
      const weightsPath = require(`../data/weights/${this.props.test}.csv`).default;
      const state = {};
      const weightsData = await csv(weightsPath);
      for(const weightsCategory of this.weightsCategories) {
        state[`${weightsCategory}_weights`] = [];
        for(const weight of weightsData.filter(d => d.section === weightsCategory)) {
          state[`${weightsCategory}_weights`][weight.raw_score] = weight.weighted;
        }
      }
      this.setState(state);
    }

  }

  changeAnswers(section, questionNum, answer) {
    this.setState(prevState => {
      const state = {};
      state[`${section}_user_answers`] = [...prevState[`${section}_user_answers`]];
      if(prevState[`${section}_user_answers`][questionNum-1] === answer) {
        state[`${section}_user_answers`][questionNum-1] = '';
        state[`${section}_num_answered`] = prevState[`${section}_num_answered`] - 1;
      }
      else {
        if(prevState[`${section}_user_answers`][questionNum-1] === '') {
          state[`${section}_num_answered`] = prevState[`${section}_num_answered`] + 1;
        }
        state[`${section}_user_answers`][questionNum-1] = answer;
      }
      state['rerenderSection'] = section;
      state[`${section}_user_answers`] = [...prevState[`${section}_user_answers`]];
      if(prevState[`${section}_user_answers`][questionNum-1] === answer) {
        state[`${section}_user_answers`][questionNum-1] = '';
        state[`${section}_num_answered`] = prevState[`${section}_num_answered`] - 1;
      }
      else {
        if(prevState[`${section}_user_answers`][questionNum-1] === '') {
          state[`${section}_num_answered`] = prevState[`${section}_num_answered`] + 1;
        }
        state[`${section}_user_answers`][questionNum-1] = answer;
      }
      state['rerenderSection'] = section;
      return state;
    });
  }

  gradeQuestion(userAnswer, answer, type) {
    if(type === 'mcq') {
      return userAnswer === answer.toUpperCase();
    }
    else { // type is saq
      // check if input is valid.
      if((userAnswer.match(/[\.\/]/g) || []).length > 1) {
        return false;
      }

      let userAnswerFiltered = -1;
      if((userAnswer.match(/\//g) || []).length === 1) { // case if userAnswer is a fraction
        const fractionArguments = userAnswer.split('/');
        userAnswerFiltered = fractionArguments[0] / fractionArguments[1];
      }
      else { // case if userAnswer is a decimal or integer
        userAnswerFiltered = +userAnswer;
      }

      const answerSplitInequality = answer.split('<');
      if(answerSplitInequality.length === 3) {
        return +answerSplitInequality[0] < userAnswerFiltered && userAnswerFiltered < +answerSplitInequality[2];
      }

      const validAnswers = answer.split(',');
      for(const potentialAnswer of validAnswers) {
        if((potentialAnswer.match(/\//g) || []).length === 1) { // case if userAnswer is a fraction
        const fractionArguments = potentialAnswer.split('/');
        const potentialAnswerFraction = fractionArguments[0] / fractionArguments[1];
          if(Math.abs(potentialAnswerFraction - userAnswerFiltered) < 0.001) return true;
        }
        else { // case if potentialAnswer is a decimal or integer
          if(userAnswerFiltered === +potentialAnswer) return true;
        }
      }
      return false;
    }
  }

  changeGradedQuestion(section, i, gradeAnyways) {
    if(!this.state.suppressModal && !gradeAnyways && this.state[`${section}_user_answers`][i] === '') {
      this.setState({
        showBlankAnswersModal: true,
        curSectionToGrade: section,
        curQuestionToGrade: i
      });
    }
    else {
      this.setState(prevState => {
        const state = {};
        const isCorrect = this.gradeQuestion(prevState[`${section}_user_answers`][i], prevState[`${section}_questions`][i].answer, prevState[`${section}_questions`][i].type);
        state[`${section}_graded`] = [...prevState[`${section}_graded`]];
        state[`${section}_user_answers`] = [...prevState[`${section}_user_answers`]];
        state[`${section}_correct`] = [...prevState[`${section}_correct`]];
        state[`${section}_graded`][i] = true;
        state[`${section}_user_answers`][i] = prevState[`${section}_user_answers`][i] === '' ? '~' : prevState[`${section}_user_answers`][i];
        state[`${section}_correct`][i] = isCorrect;
        state[`${section}_num_correct`] = prevState[`${section}_num_correct`] + (isCorrect ? 1 : 0); 
        return state
      });
    }
  }

  changeGradedSection(section, gradeAnyways) {
    if(!this.state.suppressModal && !gradeAnyways && this.state[`${section}_user_answers`].some(d => d === '')) {
      this.setState({
        showBlankAnswersModal: true,
        curSectionToGrade: section,
      });
    }
    else {
      this.setState(prevState => {
        const numQuestions = prevState[`${section}_questions`].length;
        const state = {};
        state[`${section}_graded`] = new Array(numQuestions).fill(true);
        state[`${section}_user_answers`] = prevState[`${section}_user_answers`].map(d => d === '' ? '~' : d);
        state[`${section}_correct`] = new Array(numQuestions);
        state[`${section}_num_correct`] = 0;
        state[`${section}_num_answered`] = state[`${section}_user_answers`].filter(d => d !== '~').length;
        for(let i = 0; i < numQuestions; ++i) {
          const isCorrect = this.gradeQuestion(prevState[`${section}_user_answers`][i], prevState[`${section}_questions`][i].answer, prevState[`${section}_questions`][i].type);
          state[`${section}_correct`][i] = isCorrect;
          if(isCorrect) ++state[`${section}_num_correct`];
        }
        return ({ ...state, pressedGradeButtonIndex: prevState.pressedGradeButtonIndex+1})
      });
    }
  }

  changeGradedTest(gradeAnyways) {
    let anyUnansweredQuestions = false;
    this.state.sections.forEach(section => {
      anyUnansweredQuestions = anyUnansweredQuestions || this.state[`${section}_user_answers`].some(d => d === '');
    });
    if(!this.state.suppressModal && !gradeAnyways && anyUnansweredQuestions) {
      this.setState({
        showBlankAnswersModal: true,
      });
    }
    else {
      this.setState(prevState => {
        const state = {};
        state.graded = true;
        this.state.sections.forEach(section => {
          const numQuestions = prevState[`${section}_questions`].length;
          state[`${section}_graded`] = new Array(numQuestions).fill(true);
          state[`${section}_user_answers`] = prevState[`${section}_user_answers`].map(d => d === '' ? '~' : d);
          state[`${section}_correct`] = new Array(numQuestions);
          state[`${section}_num_correct`] = 0;
          state[`${section}_num_answered`] = state[`${section}_user_answers`].filter(d => d !== '~').length;
          for(let i = 0; i < numQuestions; ++i) {
            const isCorrect = this.gradeQuestion(prevState[`${section}_user_answers`][i], prevState[`${section}_questions`][i].answer, prevState[`${section}_questions`][i].type);
            state[`${section}_correct`][i] = isCorrect;
            if(isCorrect) ++state[`${section}_num_correct`];
          }
        });
        return ({ ...state, pressedGradeButtonIndex: prevState.pressedGradeButtonIndex+1})
      });
    }
  }

  gradeAnyways() {
    if(typeof this.state.curQuestionToGrade !== 'undefined') {
      this.changeGradedQuestion(this.state.curSectionToGrade, this.state.curQuestionToGrade, true);
      this.setState({
        curQuestionToGrade: undefined,
        curSectionToGrade: undefined
      });
    }
    else if(typeof this.state.curSectionToGrade !== 'undefined') {
      this.changeGradedSection(this.state.curSectionToGrade, true);
      this.setState({
        curSectionToGrade: undefined
      });
    }
    else {
      this.changeGradedTest(true);
    }
  }

  handleShowAnswer(section, questionNumber, element) {

    if(typeof this.state.oldHighlightedElement !== 'undefined') {
      this.state.oldHighlightedElement.classList.remove('active');
    }

    if(section === this.state.questionInfoSection && questionNumber-1 === this.state.questionInfoIndex && this.state.isQuestionInfoActive) {
      this.setState({ isQuestionInfoActive: false });
    }
    else {
      element.classList.add('active');
      this.setState(() => ({ 
        questionInfoSection: section,
        questionInfoIndex: questionNumber-1,
        oldHighlightedElement: element,
        isQuestionInfoActive: true
      }));
    }
  }

  render() {
    if(this.state.failedToLoad) return <Redirect to='/not-found' />

    if(typeof this.state['reading_questions'] === 'undefined') return <></>;

    const weightedSections = {};
    for(let section of this.state.sections) {
      let weighted = '?';
      if(section === 'reading' || section === 'writing') {
        weighted = this.state[`${section}_weights`][this.state[`${section}_num_correct`]] * 10;
      }
      else if(section === 'math_calc') {
        if(this.state[`math_no_calc_graded`].some(d => d) || this.state[`math_calc_graded`].some(d => d)) {
          weighted = this.state['math_weights'][this.state[`math_calc_num_correct`] + this.state[`math_no_calc_num_correct`]] * 10;
        }
      }
      weightedSections[section] = weighted;
    }

    const englishSectionWeighted = this.state[`reading_graded`].some(d => d) || this.state[`writing_graded`].some(d => d)
      ? weightedSections['reading'] + weightedSections['writing']
      : '?';
    
    const mathSectionWeighted = weightedSections['math_calc']

    const overallWeighted = englishSectionWeighted !== '?' &&  mathSectionWeighted !== '?' ? englishSectionWeighted + mathSectionWeighted : '?';

    return <div className={this.props.testViewMode ? 'grade-compact' : ''}>
      <QuestionInfo 
        isActive={this.state.isQuestionInfoActive}
        section={this.state.questionInfoSection}
        questionNumber={this.state.questionInfoIndex+1}
        isGraded={this.state[`${this.state.questionInfoSection}_graded`][this.state.questionInfoIndex]}
        question={this.state[`${this.state.questionInfoSection}_questions`][this.state.questionInfoIndex]}
        changeGradedQuestion={this.changeGradedQuestion.bind(this)}
        isFloating={this.props.testViewMode}
        windowWidth={this.props.windowWidth}
        test={this.props.test}
      />
      <Alert variant='main' style={{margin: this.props.testViewMode ? '20px' : isMobile ? '0 0 1em 0' : '0 0 40px 0'}}>
        <p>Type in the question input or click on the bubbles to input your answers.</p>
        <p>Type 1, 2, 3, 4 to quickly enter A, B, C, D into the question text input.</p>
      </Alert>
      {isMobile && <Alert variant='main' style={{marginBottom: '40px'}}>
        <p>On mobile, use one the following links to access the test:</p>
        {testUrls[this.props.test].map((url, i) => {
          let hostname = new URL(url).hostname;
          if(hostname.length > 20) hostname = hostname.substr(hostname.indexOf('.')+1);
          return <p><a target='_blank' href={url}>Link {i+1} {i === 0 && '(preferred) '}({hostname})</a></p>
        })}
      </Alert>}
      {this.state.sections.map(section => 
        <Section 
          key={section}
          sectionName={section}
          questions={this.state[`${section}_questions`]} 
          userAnswer={this.state[`${section}_user_answers`]}
          graded={this.state[`${section}_graded`]}
          correct={this.state[`${section}_correct`]}
          handleAnswerChange={this.changeAnswers.bind(this)}
          handleGradedQuestionChange={this.changeGradedQuestion.bind(this)}
          handleGradedSectionChange={this.changeGradedSection.bind(this)}
          numCorrect={this.state[`${section}_num_correct`]}
          numAnswered={this.state[`${section}_num_answered`]}
          weighted={weightedSections[section]}
          shouldRerender={section === this.state.rerenderSection}
          compactMode={this.props.testViewMode || this.props.windowWidth <= 620}
          handleShowAnswer={this.handleShowAnswer.bind(this)}
          rerenderIndex={this.props.rerenderIndex}
          windowWidth={this.props.windowWidth}
        />
      )}
      <ScoreSummary
        reading_correct={this.state.reading_correct}
        writing_correct={this.state.writing_correct}
        math_no_calc_correct={this.state.math_no_calc_correct}
        math_calc_correct={this.state.math_calc_correct}
        reading_questions={this.state.reading_questions}
        writing_questions={this.state.writing_questions}
        math_no_calc_questions={this.state.math_no_calc_questions}
        math_calc_questions={this.state.math_calc_questions}
        weightedMath={mathSectionWeighted}
        weightedEnglish={englishSectionWeighted}
        weightedOverall={overallWeighted}
        allQuestions={this.state.allQuestions}
        isFloating={this.props.testViewMode}
        forceRerender={this.state.justRerendered}
        pressedGradeButtonIndex={this.state.pressedGradeButtonIndex}
        rerenderIndex={this.props.rerenderIndex}
      />
      <div className='grade-footer-aligner' style={{textAlign: 'right'}}>
        <button type='button' className='grade-button btn' disabled={this.state.graded}
          onClick={() => {
            this.changeGradedTest();
          }} 
        >
          <span className='fas fa-edit' /> Grade Test
        </button>
      </div>
      <Modal show={this.state.showBlankAnswersModal} onHide={() => this.setState({showBlankAnswersModal: false})}>
        <Modal.Header closeButton>
          <Modal.Title>Unanswered Questions Remain</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          On the SAT, you are not penalized for incorrect answers.
          To earn the highest score, make sure to answer every question even if you're unsure.
        </Modal.Body>
        <Modal.Body>
          <input type='checkbox' id='grade-suppress-modal' className='form-check-input' 
            value={this.state.suppressModal} 
            onChange={ () => this.setState( prevState => ({ suppressModal: !prevState.suppressModal }) ) }
          /> {/* comment adds a space between checkbox and label */}
          <label for='grade-suppress-modal' className='form-check-label'>
            Stop showing this warning
          </label>
        </Modal.Body>
        <Modal.Footer>
          <Button variant='sub' onClick={() => {this.gradeAnyways(); this.setState({showBlankAnswersModal: false});}}>
            <span className='fas fa-edit' /> Grade Anyways
          </Button>
          <Button variant='main' onClick={() => this.setState({showBlankAnswersModal: false})}>
            <span className='fas fa-pen-nib' /> Change Answers
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  }

}

Grade.propTypes = {
  test: PropTypes.string,
  testViewMode: PropTypes.bool,
  thirdPartyMode: PropTypes.bool,
  rerenderIndex: PropTypes.number,
  windowWidth: PropTypes.number
}

Grade.defaultProps = {
  testViewMode: false,
  rerenderIndex: 0
}