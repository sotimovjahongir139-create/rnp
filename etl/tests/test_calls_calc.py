from etl.amo_calls import calc

def make(direction, duration, ts, cid):
    return {"direction": direction, "duration": duration, "created_at": ts, "contact_id": cid}

def test_calc_counts_and_recall():
    recs = [
        make("inbound", 0, 1747033200, 1),    # missed client 1
        make("inbound", 42, 1747033800, 2),   # answered inbound
        make("outbound", 30, 1747033800, 1),  # recall of client 1
    ]
    s = calc(recs)
    assert s["incoming"] == 1
    assert s["outgoing"] == 1
    assert s["missed"] == 1
    assert s["recalled"] == 1
    assert s["not_recalled"] == 0
    assert s["total"] == 3  # incoming + outgoing + missed
