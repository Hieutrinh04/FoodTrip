import unittest
from train_retriever import choose_threshold, answered_at


class RetrieverTrainingTests(unittest.TestCase):
    def test_tied_scores_do_not_overstate_precision(self):
        ranked = [[('correct', .9)], [('wrong', .9)]]
        gold = ['correct', 'other']
        threshold = choose_threshold(ranked, gold)
        self.assertGreater(threshold, 1)
        self.assertEqual(answered_at(ranked, gold, threshold)['answered'], 0)

    def test_threshold_rounding_cannot_include_a_lower_incorrect_score(self):
        ranked = [[('correct', .90004)], [('wrong', .90001)]]
        threshold = choose_threshold(ranked, ['correct', 'other'])
        self.assertEqual(threshold, .90004)
        self.assertEqual(answered_at(ranked, ['correct', 'other'], threshold)['right_when_answered'], 1)


if __name__ == '__main__':
    unittest.main()
