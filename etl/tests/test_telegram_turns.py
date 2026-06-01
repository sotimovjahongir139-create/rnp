from etl.amo_telegram import build_turns, analyze_conversation

def ev(t, ts, lead=1, contact=1, talk=1):
    return {"type": t, "created_at": ts, "lead_id": lead, "contact_id": contact, "talk_id": talk}

def test_turns_and_answered():
    events = [
        ev("incoming_chat_message", 1000),
        ev("incoming_chat_message", 1060),   # same client turn
        ev("outgoing_chat_message", 1180),   # manager reply 2 min later
    ]
    turns = build_turns(events)
    assert len(turns) == 2 and turns[0]["side"] == "CLIENT" and turns[0]["count"] == 2
    rows, mins = analyze_conversation(1, events)
    assert rows[0]["status"] == "ANSWERED"
    assert round(mins[0], 1) == 2.0
