import pytest

from lambdas.generate_snippets_for_figure import text_utils


def test_sanitize_trims_and_collapses():
    assert text_utils.sanitize(" （ 信念 ） を    つらぬく ") == "信念 を つらぬく"


def test_normalize_ja_nfkc_and_katakana():
    original = "ガッコウ"
    assert text_utils.normalize_ja(original) == "がっこう"


def test_norm_hash_consistency():
    a = "志を磨け"
    b = "志を  磨け"
    assert text_utils.norm_hash(a) == text_utils.norm_hash(b)


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        ("志を磨け", "志を磨け", 0),
        ("志を磨け", "心を磨け", 1),
        ("努力を惜しまない", "努力は惜しまない", 1),
    ],
)
def test_levenshtein_distance(a, b, expected):
    assert text_utils.levenshtein_distance(a, b) == expected


def test_is_similar_threshold():
    assert text_utils.is_similar("志を磨け", ["志を磨け"], threshold=0)
    assert not text_utils.is_similar("志を磨け", ["心を磨け"], threshold=0)
