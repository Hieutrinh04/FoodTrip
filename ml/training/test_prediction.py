import unittest
import numpy as np
from predict_ner import decode_logits, free_memory_mb


class PredictionTests(unittest.TestCase):
    def logits(self, labels):
        result = np.zeros((1,len(labels),5))
        for i,label in enumerate(labels): result[0,i,label] = 10
        return result

    def test_ignores_special_and_nonfirst_bpe_positions(self):
        result = decode_logits(['Quán','_A','ngon'], [False,True,False,True,True,False], 3,
                               self.logits([4,1,4,2,0,4]))
        self.assertEqual(result['entities'], [{'label':'BUSINESS','text':'Quán A'}])
        self.assertEqual(result['tags'], ['B-BUSINESS','I-BUSINESS','O'])
        self.assertFalse(result['production_ready'])
        self.assertTrue(result['requires_confirmation'])

    def test_negative_caption_and_orphan_i_do_not_invent_entities(self):
        result = decode_logits(['không','địa','điểm'], [False,True,True,True,False], 3,
                               self.logits([0,0,2,0,0]))
        self.assertEqual(result['entities'], [])

    def test_truncation_is_reported(self):
        result = decode_logits(['A','B'], [False,True,False], 1, self.logits([0,1,0]))
        self.assertTrue(result['truncated'])

    def test_invalid_or_nonfinite_output_is_rejected(self):
        with self.assertRaises(ValueError): decode_logits(['A'],[False,True,False],1,self.logits([0,0]))
        with self.assertRaises(ValueError): decode_logits(['A'],[False,True,False],2,self.logits([0,1,0]))
        with self.assertRaises(ValueError): decode_logits(['A'],[False,True,False],1,np.full((1,3,5),np.nan))

    def test_memory_probe_is_read_only_and_positive(self):
        self.assertGreater(free_memory_mb(), 0)


if __name__ == '__main__':
    unittest.main()
