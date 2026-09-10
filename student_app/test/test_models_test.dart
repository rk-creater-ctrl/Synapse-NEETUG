import 'package:flutter_test/flutter_test.dart';
import 'package:synapse_neetug/features/learning/data/test_models.dart';

void main() {
  test('counts down from the server deadline without a client duration', () {
    final deadline = DateTime.utc(2026, 9, 9, 12);
    expect(
      remainingUntil(deadline, DateTime.utc(2026, 9, 9, 11, 59, 30)),
      const Duration(seconds: 30),
    );
    expect(
      remainingUntil(deadline, DateTime.utc(2026, 9, 9, 12, 1)),
      Duration.zero,
    );
  });

  test('parses finalized result and review server fields', () {
    final result = TestResult.fromJson({
      'attemptId': 'attempt-1',
      'testId': 'test-1',
      'status': 'SUBMITTED',
      'testTitle': 'Physics',
      'score': 3,
      'totalMarks': 4,
      'correctCount': 1,
      'incorrectCount': 1,
      'unansweredCount': 0,
      'totalQuestionCount': 2,
    });
    expect(result.score, 3);
    expect(result.totalQuestionCount, 2);
  });
}
