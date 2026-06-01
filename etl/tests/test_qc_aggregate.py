from etl.qc import aggregate


def test_aggregate_sums_by_date_sku_reason_category():
    rows = [
        {"d": "2026-05-25", "sku": "A", "reason": "r1", "category": "qayta", "qty": 3},
        {"d": "2026-05-25", "sku": "A", "reason": "r1", "category": "qayta", "qty": 2},
        {"d": "2026-05-25", "sku": "B", "reason": "r2", "category": "yamala", "qty": 5},
    ]
    out = aggregate(rows)
    assert out[("2026-05-25", "A", "r1", "qayta")] == 5
    assert out[("2026-05-25", "B", "r2", "yamala")] == 5
