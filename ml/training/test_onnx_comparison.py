import unittest
import numpy as np
from check_onnx import compare_outputs


class ComparisonTests(unittest.TestCase):
    def test_identical_dynamic_batches(self):
        for batch,length in [(1,3),(1,14),(2,14)]:
            values = np.zeros((batch,length,5)); values[:,:,1] = 1
            result = compare_outputs(values,values,np.ones((batch,length),dtype=bool))
            self.assertEqual(result['shape'],[batch,length,5])
            self.assertEqual(result['max_abs_error'],0)

    def test_small_roundoff_is_accepted(self):
        values = np.zeros((1,3,5)); values[:,:,1] = 1
        self.assertTrue(compare_outputs(values,values+1e-5,[[False,True,False]])['prediction_labels_agree'])

    def test_nonfinite_and_mismatched_shapes_are_rejected(self):
        values = np.zeros((1,3,5))
        with self.assertRaises(ValueError): compare_outputs(values,np.full_like(values,np.nan),[[True]*3])
        with self.assertRaises(ValueError): compare_outputs(values,np.zeros((1,4,5)),[[True]*3])

    def test_close_logits_but_changed_predicted_labels_are_rejected(self):
        expected = np.zeros((1,1,5)); expected[0,0,1] = 0.0002
        actual = np.zeros((1,1,5)); actual[0,0,3] = 0.0002
        with self.assertRaises(ValueError): compare_outputs(expected,actual,[[True]])

    def test_large_numerical_difference_is_rejected(self):
        with self.assertRaises(AssertionError): compare_outputs(np.zeros((1,1,5)),np.ones((1,1,5)),[[True]])


if __name__ == '__main__':
    unittest.main()
