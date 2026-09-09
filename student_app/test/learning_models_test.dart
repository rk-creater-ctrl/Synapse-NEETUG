import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/learning_models.dart';

void main() {
  final safeQuestion = <String, dynamic>{
    'id': 'question-1',
    'type': 'SINGLE_CORRECT_MCQ',
    'sourceType': 'PYQ',
    'stem': 'Which unit measures length?',
    'difficulty': 'EASY',
    'tags': ['units'],
    'options': [
      {'id': 'option-a', 'position': 1, 'text': 'Metre'},
      {'id': 'option-b', 'position': 2, 'text': 'Second'},
    ],
    'pyqMetadata': {
      'sourceExam': 'NEET',
      'year': 2024,
      'sessionKey': 'MAIN',
      'paperKey': 'P1',
      'questionNumber': 7,
    },
  };

  test('parses only student-safe question option fields and PYQ metadata', () {
    final question = StudentQuestion.fromJson(safeQuestion);

    expect(question.sourceType, 'PYQ');
    expect(question.options.first.text, 'Metre');
    expect(question.pyqMetadata?.year, 2024);
    expect(question.pyqMetadata?.questionNumber, 7);
  });

  test('keeps an unanswered practice item without feedback', () {
    final item = PracticeItem.fromJson({
      'id': 'item-1',
      'sequence': 1,
      'unavailable': false,
      'question': safeQuestion,
    });

    expect(item.answered, isFalse);
    expect(item.answer, isNull);
    expect(item.question?.stem, 'Which unit measures length?');
  });

  test('parses server feedback only after an answered item response', () {
    final item = PracticeItem.fromJson({
      'id': 'item-1',
      'sequence': 1,
      'question': safeQuestion,
      'answer': {
        'selectedOptionId': 'option-b',
        'isCorrect': false,
        'correctOptionId': 'option-a',
        'explanation': 'Metre is the SI unit of length.',
        'timeSpentSeconds': 9,
      },
    });

    expect(item.answered, isTrue);
    expect(item.answer?.isCorrect, isFalse);
    expect(item.answer?.correctOptionId, 'option-a');
  });

  test('represents hidden session content as unavailable without fabricating a question', () {
    final item = PracticeItem.fromJson({
      'id': 'item-hidden',
      'sequence': 2,
      'unavailable': true,
    });

    expect(item.unavailable, isTrue);
    expect(item.question, isNull);
    expect(item.answer, isNull);
  });

  test('parses completion summaries supplied by the server', () {
    final session = PracticeSession.fromJson({
      'id': 'session-1',
      'status': 'COMPLETED',
      'summary': {
        'totalQuestions': 10,
        'answeredQuestions': 8,
        'correctAnswers': 6,
        'incorrectAnswers': 2,
        'unansweredQuestions': 2,
        'accuracyPercentage': 75,
      },
      'items': const [],
    });

    expect(session.summary.accuracyPercentage, 75);
    expect(session.summary.unansweredQuestions, 2);
  });
}
