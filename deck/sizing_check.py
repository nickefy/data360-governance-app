"""Re-checks the submitted 1-year sizing (../../data360-sizing/scripts/model.py) against what the demo built.

Does NOT change the sizing model; it applies overrides on a copy of the drivers.
Usage: python3 sizing_check.py            (prints the table; build_deck.py imports results())
"""
import copy
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data360-sizing", "scripts"))
import model  # noqa: E402

BASE_DRIVERS = copy.deepcopy(model.DRIVERS)


def run(overrides=None, dev_prod_spec_hours=0.0):
    """overrides: {driver: {scenario: value}}; dev_prod_spec_hours: monthly hours of a prod-spec DQ run in DEV."""
    model.DRIVERS = copy.deepcopy(BASE_DRIVERS)
    for k, per in (overrides or {}).items():
        lab, unit, vals, src = model.DRIVERS[k]
        model.DRIVERS[k] = (lab, unit, {**vals, **per}, src)
    out = {}
    for s in model.SCENARIOS:
        r = model.compute(s)
        d = {k: v[2][s] for k, v in model.DRIVERS.items()}
        extra = dev_prod_spec_hours * d["dq_dbu_hr"] * model.RATES["Jobs Serverless"][0] * 12 * (1 - model.DISCOUNT)
        out[s] = r["net_y"] + extra
    model.DRIVERS = copy.deepcopy(BASE_DRIVERS)
    return out


NO_LAKEBASE = {"lakebase_cu": {s: 0 for s in model.SCENARIOS}}
# "Run once a month for 20 hours" (walkthrough notes) -- two readings
# 20 h total for the whole monthly cycle, spread across tenants (tenant count kept, so mart refresh is unchanged)
CYCLE_20H = {"dq_runs": {s: 1 for s in model.SCENARIOS},
             "dq_hours": {s: 20 / BASE_DRIVERS["tenants"][2][s] for s in model.SCENARIOS}}
PER_BU_20H = {"dq_runs": {s: 1 for s in model.SCENARIOS}, "dq_hours": {s: 20 for s in model.SCENARIOS}}


def results():
    sub = run()
    nolb = run(NO_LAKEBASE)
    return {
        "submitted": sub,
        "no_lakebase": nolb,
        "cycle_20h": run({**NO_LAKEBASE, **CYCLE_20H}),
        "per_bu_20h": run({**NO_LAKEBASE, **PER_BU_20H}),
        # prod-spec DEV run: one 20 h cycle a month, or 20 h per tenant (Base 14 tenants)
        "dev_one": run(NO_LAKEBASE, 20)["Base"] - nolb["Base"],
        "dev_per_bu": run(NO_LAKEBASE, 20 * BASE_DRIVERS["tenants"][2]["Base"])["Base"] - nolb["Base"],
    }


if __name__ == "__main__":
    r = results()
    for k in ["submitted", "no_lakebase", "cycle_20h", "per_bu_20h"]:
        print(f"{k:12s} " + "  ".join(f"{s} ${r[k][s]:>10,.0f}" for s in model.SCENARIOS))
    print(f"DEV at prod spec (Base): one 20h run/month +${r['dev_one']:,.0f}/yr · 20h per BU +${r['dev_per_bu']:,.0f}/yr")
