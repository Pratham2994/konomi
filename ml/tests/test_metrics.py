import numpy as np
import scipy.sparse as sp

from konomi_ml.metrics import ndcg_at_k, recall_at_k, topk


def test_recall_ndcg_known_values():
    # 2 users, 4 items. User 0 target = {0}, user 1 target = {3}. Fold-in: user 0 has item 1.
    target = sp.csr_matrix(np.array([[1, 0, 0, 0], [0, 0, 0, 1]], dtype=np.float32))
    fold_in = sp.csr_matrix(np.array([[0, 1, 0, 0], [0, 0, 0, 0]], dtype=np.float32))
    scores = np.array([[0.9, 5.0, 0.1, 0.0],   # item 1 excluded -> item 0 ranked first: perfect
                       [0.9, 0.8, 0.7, 0.1]])  # target ranked last of 4
    top = topk(scores, fold_in, 3)
    assert top[0, 0] == 0
    assert 1 not in top[0]
    np.testing.assert_allclose(recall_at_k(top, target, 1), [1.0, 0.0])
    np.testing.assert_allclose(ndcg_at_k(top, target, 1), [1.0, 0.0])
    top4 = topk(scores, sp.csr_matrix((2, 4)), 3)
    # user 1's target at rank 4 is outside top-3; with k=3 recall 0
    np.testing.assert_allclose(recall_at_k(top4, target, 3)[1], 0.0)
    scores2 = np.array([[0, 0, 0, 0], [0.9, 0.8, 0.1, 0.85]])
    top_b = topk(scores2, sp.csr_matrix((2, 4)), 3)  # user 1: [0, 3, 1] -> target at rank 2
    np.testing.assert_allclose(ndcg_at_k(top_b, target, 3)[1], 1 / np.log2(3))
