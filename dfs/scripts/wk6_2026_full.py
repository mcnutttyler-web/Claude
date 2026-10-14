"""Week 6 2026 (Sun Oct 18) DK Main slate — FULL research run, built from web-search results (Oct 13-14).

No props were posted yet and page fetches were blocked, so every median is a free-site number (PPR ~= DK for
skill players; noted) or an `est` anchored to the consensus implied total. Salaries left blank (no DKSalaries.csv).
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).resolve().parent.parent / "data" / "weekly"
DATE, MODE = "2026-10-14", "FULL"

# team, opp, home_away, kickoff_et, spread(team's own), total, wind, precip, dome, notes
GAMES = [  # consensus of CBS/ESPN/bet365/Fanatics/SBR snapshots Oct 13 (median of books)
    ("CHI", "ATL", "1:00 PM", -3.5, 49.0, None, "", "Y", "CBS -3/49.5; Fanatics -3.5/49; bet365 -3.5/47.5"),
    ("BAL", "CLE", "1:00 PM", -4.0, 40.5, 15, "", "N", "CBS -4.5; bet365 -3.5; Lamar ankle status unresolved"),
    ("IND", "TEN", "1:00 PM", -7.0, 44.25, None, "", "Y", "CBS -7/44.5; Fanatics 44"),
    ("NE", "NYJ", "1:00 PM", -7.5, 43.5, 10, "slight chance rain", "N", "CBS/bet365 -7.5; Fanatics -7"),
    ("NYG", "NO", "1:00 PM", -1.5, 45.5, 11, "slight chance rain", "N", "CBS/bet365 NYG -1.5; one preview has NO -1.5 (Dart IR) - verify"),
    ("PHI", "CAR", "1:00 PM", -1.5, 41.5, 10, "rain possible (sources conflict)", "N", "total opened 43.5"),
    ("PIT", "TB", "1:00 PM", -3.0, 40.5, 20, "low", "N", "wind 15-25 mph forecast (KickoffWeather; Covers ~21) - 4 days out"),
    ("LAR", "ARI", "4:05 PM", -12.5, 52.5, None, "", "Y", "ESPN -13.5; CBS/SBR -12.5; total opened 46.5"),
    ("BUF", "LV", "4:25 PM", -6.0, 52.5, None, "", "Y", "ESPN 53.5; CBS/SBR 52.5; SBR -5.5"),
    ("KC", "LAC", "4:25 PM", -8.5, 42.5, 15, "", "N", "SBR total 43.5; LAC lowest implied total of week"),
]
FAV_IS_HOME = {"CHI": False, "BAL": False, "IND": True, "NE": True, "NYG": True, "PHI": True, "PIT": False,
               "LAR": True, "BUF": False, "KC": True}

# name, team, pos, median_basis, sources, conf, status, p_play, late_swap, notes
# median_basis: number = DK-median estimate (see notes); free-site PPR used as DK proxy where cited.
P = [
 # CHI (26.25)
 ("Caleb Williams","CHI","QB",19.0,"Yahoo;SI;Dimers;est",0.4,"Q",0.71,"N","Hamstring; trending to return. Dimers 230 pass yds. Bagent starts if out"),
 ("Tyson Bagent","CHI","QB",12.5,"SI;est",0.25,"",0.98,"N","Only if Caleb sits; 3 INT in 2 starts"),
 ("D'Andre Swift","CHI","RB",14.5,"Dimers;est",0.45,"",0.98,"N","Dimers 59.9% anytime TD; Monangai day-to-day"),
 ("Kyle Monangai","CHI","RB",7.5,"Yahoo;est",0.3,"Q",0.71,"N","Thumb/toe, day-to-day"),
 ("Rome Odunze","CHI","WR",13.5,"est",0.3,"",0.98,"N","Role unverified this week; boost if Caleb plays"),
 ("Luther Burden III","CHI","WR",9.0,"Rotoballer;est",0.35,"",0.98,"N","Rotoballer bust call; ATL strong vs slot"),
 ("Colston Loveland","CHI","TE",7.5,"Rotoballer;DKNetwork;est",0.35,"",0.98,"N","Sit per two sources; ATL 6.2 YPA allowed"),
 ("Bears","CHI","DST",6.0,"SI;est",0.35,"",1.0,"N","Edge if Penix sits (ATL 8 ppg without him)"),
 # ATL (22.75)
 ("Michael Penix Jr.","ATL","QB",17.0,"ESPN;SI;est",0.35,"Q",0.71,"N","Ribs, 'not serious'; must practice. ATL 34.3 ppg with him"),
 ("Bijan Robinson","ATL","RB",23.0,"Dimers;FantasyPros",0.6,"",0.98,"N","Dimers 24.5 PPR; trimmed for Penix risk"),
 ("Drake London","ATL","WR",17.0,"BR;BigLead;est",0.45,"",0.98,"N","B/R WR2, Big Lead WR10; QB-dependent"),
 ("Kyle Pitts","ATL","TE",9.0,"est",0.3,"",0.98,"N","Role unverified this week"),
 ("Falcons","ATL","DST",4.5,"SI;est",0.35,"",1.0,"N","SI must-sit defense"),
 # BAL (22.25)
 ("Lamar Jackson","BAL","QB",21.5,"Dimers;NBC;est",0.45,"Q",0.71,"N","Ankle; 'real chance' (Rapoport). Dimers 21.0. Huntley started Week 5"),
 ("Tyler Huntley","BAL","QB",14.0,"NBC;est",0.25,"",0.98,"N","Starts only if Lamar out"),
 ("Derrick Henry","BAL","RB",16.0,"Squawka;SBD;est",0.45,"",0.98,"N","476 rush yds; ~19.5 carry est; CLE 4.48 YPC allowed"),
 ("Zay Flowers","BAL","WR",15.0,"BigLead;est",0.45,"",0.98,"N","Big Lead WR5; down if Huntley starts"),
 ("Mark Andrews","BAL","TE",8.0,"est",0.25,"",0.98,"N","Role unverified this week"),
 ("Ravens","BAL","DST",9.0,"Lindys;NBC;Rotoballer;est",0.55,"",1.0,"N","CLE allowed league-most 19 sacks; CLE 18.3 implied"),
 # CLE (18.25)
 ("Deshaun Watson","CLE","QB",14.5,"Squawka;est",0.35,"",0.98,"N","Under pressure; 19 sacks taken"),
 ("Quinshon Judkins","CLE","RB",12.0,"ESPN;Yahoo;est",0.3,"Q",0.71,"N","Ankle, wore boot; day-to-day"),
 ("Denzel Boston","CLE","WR",11.5,"Squawka;est",0.4,"",0.98,"N","Team-high 330 rec yds"),
 ("Jerry Jeudy","CLE","WR",8.5,"est",0.2,"",0.98,"N","Role unverified this week"),
 ("Browns","CLE","DST",5.5,"est",0.3,"",1.0,"N","Higher if Lamar sits"),
 # IND (25.6)
 ("Daniel Jones","IND","QB",16.0,"SharpFootball;est",0.4,"",0.98,"N","Never above QB23 this year; Achilles return, 25 rush yds"),
 ("Jonathan Taylor","IND","RB",22.5,"Dimers;PFN",0.6,"",0.98,"N","Dimers 22.9 PPR; 7-pt home favorite"),
 ("Josh Downs","IND","WR",13.0,"SharpFootball;est",0.45,"",0.98,"N","Primary target with Pierce on IR"),
 ("Alec Pierce","IND","WR",0.0,"SharpFootball",0.9,"O",0.0,"N","Injured reserve (heel)"),
 ("Tyler Warren","IND","TE",12.0,"BR;est",0.45,"",0.98,"N","B/R TE4"),
 ("Colts","IND","DST",8.5,"NBC;Rotowire;Rotoballer;est",0.55,"",1.0,"N","TEN 31st pass EPA; <=10 pts in 3 of 5"),
 # TEN (18.6)
 ("Cam Ward","TEN","QB",13.5,"SharpFootball;est",0.4,"",0.98,"N","4.7 YPA last week; low-total team"),
 ("Tony Pollard","TEN","RB",11.0,"est",0.2,"",0.98,"N","Role unverified this week"),
 ("Calvin Ridley","TEN","WR",11.0,"est",0.2,"",0.98,"N","Role unverified this week"),
 ("Titans","TEN","DST",4.0,"est",0.3,"",1.0,"N",""),
 # NE (25.5)
 ("Drake Maye","NE","QB",21.0,"ESPN;CBS;est",0.45,"",0.98,"N","ESPN QB4 superflex; CBS projection riser"),
 ("Rhamondre Stevenson","NE","RB",15.5,"FFC;FantasyData;FTN;est",0.5,"",0.98,"N","Lead back with Henderson out"),
 ("TreVeyon Henderson","NE","RB",0.0,"Yahoo;CBS",0.7,"O",0.0,"N","High ankle sprain; Yahoo: miss multiple weeks"),
 ("A.J. Brown","NE","WR",0.0,"Yahoo",0.7,"O",0.0,"N","On IR (high ankle); earliest return Week 6 - verify activation"),
 ("Stefon Diggs","NE","WR",12.0,"est",0.2,"",0.98,"N","Role unverified this week; A.J. Brown IR"),
 ("Hunter Henry","NE","TE",10.5,"BR;Clutchpoints;est",0.35,"",0.98,"N","24.6 pts last two games (attribution unclear)"),
 ("Patriots","NE","DST",9.0,"NBC;Lindys;Rotowire;est",0.55,"",1.0,"N","NYJ 18.0 implied"),
 # NYJ (18.0)
 ("Geno Smith","NYJ","QB",13.5,"NBC;est",0.3,"",0.98,"N","Starter not confirmed this week; 6 TD 0 INT"),
 ("Braelon Allen","NYJ","RB",9.5,"FTN;NBC;est",0.35,"",0.98,"N","Likely workhorse if Hall sits"),
 ("Breece Hall","NYJ","RB",10.0,"FTN;NBC;est",0.3,"Q",0.71,"N","Quad, week-to-week"),
 ("Garrett Wilson","NYJ","WR",14.5,"BR;NBC;est",0.45,"",0.98,"N","B/R WR8; volume with Mitchell hurt"),
 ("Adonai Mitchell","NYJ","WR",7.5,"NBC;est",0.25,"Q",0.71,"N","Finger"),
 ("Jets","NYJ","DST",4.0,"est",0.3,"",1.0,"N",""),
 # NYG (23.5)
 ("Jameis Winston","NYG","QB",16.5,"SI;BigBlueView;est",0.4,"",0.98,"N","Starting for Dart (knee, IR)"),
 ("Jaxson Dart","NYG","QB",0.0,"SI",0.8,"O",0.0,"N","Knee, IR"),
 ("Cam Skattebo","NYG","RB",14.0,"est",0.25,"",0.98,"N","No injury news; role unverified"),
 ("Malik Nabers","NYG","WR",17.5,"BR;est",0.4,"",0.98,"N","B/R WR3; sat a Week 5 practice (knee) - monitor"),
 ("Isaiah Likely","NYG","TE",12.5,"Dimers;BR",0.6,"",0.98,"N","Dimers 12.9 PPR, 47.2 yds; B/R TE5"),
 ("Giants","NYG","DST",6.0,"SI;est",0.35,"",1.0,"N","Fine matchup vs weak NO line (Banks out)"),
 # NO (22.0)
 ("Tyler Shough","NO","QB",17.0,"Footballguys;est",0.35,"",0.98,"N","FBG 17.76 (stale); left hand limited earlier"),
 ("Alvin Kamara","NO","RB",8.5,"SI;est",0.3,"",0.98,"N","~6.3 ppg; Etienne on IR"),
 ("Chris Olave","NO","WR",16.0,"BR;BigLead;Yahoo",0.5,"",0.98,"N","Yahoo: 'rebound spot'; B/R WR10"),
 ("Juwan Johnson","NO","TE",11.0,"Statchasers;est",0.3,"",0.98,"N","16.1 projection is 22 days old"),
 ("Saints","NO","DST",5.0,"est",0.3,"",1.0,"N","Winston turnover risk"),
 # PHI (21.5)
 ("Jalen Hurts","PHI","QB",18.5,"SI;est",0.4,"",0.98,"N","Offense 278 ypg; WRs banged up"),
 ("Saquon Barkley","PHI","RB",15.0,"SI;Yahoo;est",0.35,"Q",0.71,"N","Hamstring; Pierce/Steele if out"),
 ("Dameon Pierce","PHI","RB",5.5,"SI;est",0.2,"",0.98,"N","Lead only if Barkley out; Shipley out"),
 ("DeVonta Smith","PHI","WR",12.5,"SI;est",0.35,"Q",0.71,"N","Hamstring, missed Week 5"),
 ("Dontayvion Wicks","PHI","WR",8.5,"SI;est",0.3,"",0.98,"N","Top target if Smith sits"),
 ("Makai Lemon","PHI","WR",7.0,"SI;est",0.25,"",0.98,"N","Rookie; rises if Smith sits"),
 ("Eagles","PHI","DST",5.0,"SI;est",0.35,"",1.0,"N","SI must-sit; CAR scoring 30 ppg"),
 # CAR (20.0)
 ("Bryce Young","CAR","QB",18.5,"SI;est",0.4,"",0.98,"N","Breakout season; CAR ~30 ppg"),
 ("Chuba Hubbard","CAR","RB",14.5,"NBC;est",0.4,"",0.98,"N","Volume RB1 with Brooks on IR"),
 ("Tetairoa McMillan","CAR","WR",15.5,"BigLead;est",0.45,"",0.98,"N","Big Lead WR9"),
 ("Jalen Coker","CAR","WR",9.0,"SI;est",0.3,"Q",0.71,"N","Quad; coach says 'on track'"),
 ("Panthers","CAR","DST",5.0,"est",0.3,"",1.0,"N","PHI offense struggling"),
 # PIT (21.75) wind game
 ("Aaron Rodgers","PIT","QB",15.0,"SI;est",0.35,"",0.98,"N","Wind 15-25 forecast: passing -10%. Quick game vs blitz"),
 ("Jaylen Warren","PIT","RB",14.0,"BR;SI;est",0.45,"",0.98,"N","Top-6 RB in one ranking; wind favors run"),
 ("Rico Dowdle","PIT","RB",5.5,"SI;est",0.25,"Q",0.71,"N",""),
 ("DK Metcalf","PIT","WR",11.0,"BigLead;est",0.4,"",0.98,"N","WR20 in one ranking; wind -10%"),
 ("Germie Bernard","PIT","WR",7.5,"BR;SI;est",0.35,"",0.98,"N","6-80 last week; Pittman IR, Wilson/Skowronek out"),
 ("Pat Freiermuth","PIT","TE",7.5,"BR;SI;est",0.35,"",0.98,"N","3 TDs last two games"),
 ("Steelers","PIT","DST",9.5,"Rotoballer;Lindys;NBC;est",0.55,"",1.0,"N","Rookie QB Daniels; TB allows 10 DST ppg"),
 # TB (18.75)
 ("Jalon Daniels","TB","QB",13.0,"SI;Clutchpoints;est",0.35,"",0.98,"N","Rookie; Mayfield out; sacked 4x in 2 starts; wind"),
 ("Baker Mayfield","TB","QB",0.0,"SI",0.7,"O",0.0,"N","Listed out"),
 ("Bucky Irving","TB","RB",12.5,"est",0.2,"",0.98,"N","Role unverified this week"),
 ("Emeka Egbuka","TB","WR",12.5,"ESPN;est",0.35,"",0.98,"N","ESPN flex list; wind -10%"),
 ("Buccaneers","TB","DST",4.5,"est",0.3,"",1.0,"N","Wind helps a bit"),
 # LAR (32.5)
 ("Matthew Stafford","LAR","QB",22.5,"FantasyPros;Dimers",0.65,"",0.98,"N","FP 21.4, Dimers 22.9; LAR lead NFL in pass yds"),
 ("Kyren Williams","LAR","RB",18.5,"PFN;FFC;est",0.45,"",0.98,"N","Top-8 RB consensus; 12.5-pt home fav"),
 ("Blake Corum","LAR","RB",7.5,"CBS;est",0.3,"",0.98,"N","CBS sneaky start; blowout snaps"),
 ("Puka Nacua","LAR","WR",22.0,"Dimers;BigLead;BR",0.65,"",0.98,"N","Dimers 22.2 PPR, 91.9 yds; WR1 Big Lead"),
 ("Davante Adams","LAR","WR",15.0,"Rotoballer;est",0.4,"",0.98,"N","Rotoballer top-15 WR"),
 ("Tyler Higbee","LAR","TE",7.5,"FantasyPros;est",0.4,"",0.98,"N","TE1 with Ferguson on IR"),
 ("Rams","LAR","DST",8.5,"Rotoballer;NBC;ESPN;est",0.5,"",1.0,"N","4th pressure rate; ARI comes from behind"),
 # ARI (20.0)
 ("Jacoby Brissett","ARI","QB",16.0,"SI;Rotoballer;est",0.4,"",0.98,"N","40 att/g, 7 TD last 3; garbage time"),
 ("Jeremiyah Love","ARI","RB",9.0,"PrizePicks;SI;est",0.3,"",0.98,"N","Rookie; script risk as 12.5-pt dog"),
 ("Michael Wilson","ARI","WR",12.5,"ESPN;BigLead;est",0.4,"",0.98,"N","WR1 after MHJ trade"),
 ("Kendrick Bourne","ARI","WR",8.0,"SI;est",0.3,"",0.98,"N","WR2 after MHJ trade"),
 ("Trey McBride","ARI","TE",16.0,"Dimers;BR",0.6,"",0.98,"N","Dimers 16.6 PPR, 60.9 yds; B/R TE2"),
 ("Cardinals","ARI","DST",2.5,"est",0.3,"",1.0,"N","Heavy dog vs top passing O"),
 # BUF (29.25)
 ("Josh Allen","BUF","QB",23.5,"FantasyPros;DraftSharks;ESPN",0.65,"",0.98,"N","FP 22.7; DraftSharks 23.4-25.3 (pages conflict)"),
 ("James Cook III","BUF","RB",18.0,"FFC;Rotoballer",0.55,"",0.98,"N","FFC 18.0 PPR; ball-security concerns"),
 ("DJ Moore","BUF","WR",12.5,"Yahoo;est",0.35,"Q",0.71,"Y","Shoulder; WR21 in one ranking. Late game"),
 ("Khalil Shakir","BUF","WR",11.5,"est",0.2,"",0.98,"Y","Role unverified; gains if Moore sits"),
 ("Dalton Kincaid","BUF","TE",9.0,"est",0.2,"",0.98,"N","Role unverified this week"),
 ("Bills","BUF","DST",6.5,"est",0.3,"",1.0,"N","LV 23.3 implied"),
 # LV (23.25)
 ("Kirk Cousins","LV","QB",17.5,"NBC;est",0.4,"",0.98,"N","1,269 yds, 12 TD thru 5; high total"),
 ("Ashton Jeanty","LV","RB",15.0,"FFC;Yahoo;FantasyData",0.45,"",0.98,"Y","FFC 16.1; 'banged up', crowded backfield"),
 ("Jakobi Meyers","LV","WR",11.0,"est",0.2,"",0.98,"N","Role unverified; Nailor Q"),
 ("Brock Bowers","LV","TE",16.0,"Dimers;BR",0.65,"",0.98,"N","Dimers 16.1 PPR, 5.6 rec, 46.5% TD; 20+ in all 3 starts"),
 ("Raiders","LV","DST",3.5,"est",0.3,"",1.0,"N","2.2 forced fumbles/g but vs Allen"),
 # KC (25.5)
 ("Patrick Mahomes","KC","QB",20.0,"Footballguys;est",0.4,"",0.98,"N","Off bye; FBG 17.6 (stale); Rice out"),
 ("Kenneth Walker III","KC","RB",21.5,"Dimers;PFN",0.6,"",0.98,"N","Dimers 22.3 PPR, 87.9 rush yds, 64.1% TD"),
 ("Travis Kelce","KC","TE",10.5,"Dimers;BR",0.5,"",0.98,"N","Dimers 43.2 yds, 29.5% TD; leads KC pass catchers"),
 ("Xavier Worthy","KC","WR",12.0,"est",0.2,"",0.98,"N","Role unverified; Rice out"),
 ("Rashee Rice","KC","WR",0.0,"SI;NBC",0.6,"O",0.0,"N","Hamstring, several-week absence"),
 ("Chiefs","KC","DST",9.5,"NBC;Rotowire;Dimers",0.55,"",1.0,"N","NBC DST1; LAC 0-5, 17.0 implied"),
 # LAC (17.0)
 ("Justin Herbert","LAC","QB",13.5,"BR;est",0.4,"",0.98,"N","5 TD 7 INT, 59.4%; wind 10-20"),
 ("Omarion Hampton","LAC","RB",9.5,"FFC;ESPN",0.45,"",0.98,"N","FFC 9.3; ESPN RB30"),
 ("Kimani Vidal","LAC","RB",5.5,"Yahoo;est",0.25,"",0.98,"N","Waiver add; few bright spots"),
 ("Ladd McConkey","LAC","WR",9.0,"Yahoo;NBC;est",0.3,"Q",0.71,"Y","Active Week 5 but ~0 snaps. Late game"),
 ("Quentin Johnston","LAC","WR",8.0,"est",0.2,"",0.98,"Y","Role unverified; up if McConkey sits"),
 ("Tre' Harris","LAC","WR",0.0,"Yahoo",0.5,"D",0.06,"Y","Hamstring, doubtful"),
 ("Charlie Kolar","LAC","TE",4.5,"BR;est",0.3,"",0.98,"N","TE1 but low usage"),
 ("Chargers","LAC","DST",3.0,"est",0.3,"",1.0,"N","Road dog at KC"),
]

SPREAD = {"QB": (0.35, 0.40), "RB": (0.50, 0.60), "WR": (0.60, 0.75), "TE": (0.65, 0.80), "DST": (1.0, 1.2)}
WIDEN = {"PIT", "TB"}  # weather game: widen pass-game ranges


def teams_frame() -> pd.DataFrame:
    rows = []
    for fav, dog, ko, spr, tot, wind, precip, dome, note in GAMES:
        home, away = (fav, dog) if FAV_IS_HOME[fav] else (dog, fav)
        for team, opp, s in ((fav, dog, spr), (dog, fav, -spr)):
            rows.append({"team": team, "opp": opp, "home_away": "home" if team == home else "away",
                         "kickoff_et": f"2026-10-18 {ko}", "spread": s, "total": tot,
                         "implied_total": round(tot / 2 - s / 2, 2), "wind_mph": "" if wind is None else wind,
                         "precip": precip, "dome": dome, "notes": note})
    return pd.DataFrame(rows)


def build() -> tuple[pd.DataFrame, pd.DataFrame]:
    t = teams_frame()
    it = t.set_index("team")["implied_total"]
    opp = t.set_index("team")["opp"]
    df = pd.DataFrame(P, columns=["name", "team", "pos", "median", "sources", "confidence", "status", "p_play",
                                  "late_swap_risk", "notes"])
    df["opp"] = df["team"].map(opp)
    df["implied_total"] = df["team"].map(it)
    df["salary"] = ""
    lo = df["pos"].map(lambda p: SPREAD[p][0])
    hi = df["pos"].map(lambda p: SPREAD[p][1])
    wide = df["team"].isin(WIDEN) & df["pos"].isin(["QB", "WR", "TE"]) | (df["status"] == "Q")
    lo = np.where(wide, np.minimum(lo + 0.10, 1.0), lo)
    hi = np.where(wide, hi + 0.15, hi)
    df["floor"] = (df["median"] * (1 - lo)).clip(lower=0).round(1)
    df["ceiling"] = (df["median"] * (1 + hi)).round(1)
    df["median"] = df["median"].round(1)

    # Ownership (est): softmax within position on projection and team total, scaled to roster totals.
    totals = {"QB": 100, "RB": 235, "WR": 345, "TE": 120, "DST": 100}
    for col, temp, cap in (("own_gpp", 0.9, 30.0), ("own_cash", 1.3, 45.0)):
        df[col] = 0.0
        for pos, g in df.groupby("pos"):
            z = (g["median"] - g["median"].mean()) / (g["median"].std() or 1)
            zt = (g["implied_total"] - g["implied_total"].mean()) / (g["implied_total"].std() or 1)
            w = np.exp(temp * (1.1 * z + 0.15 * zt)) * g["p_play"]
            share = w / w.sum() * totals[pos]
            for _ in range(20):  # cap and redistribute
                over = share > cap
                if not over.any():
                    break
                excess = (share[over] - cap).sum()
                share[over] = cap
                free = ~over & (share > 0)
                share[free] += excess * share[free] / share[free].sum()
            df.loc[g.index, col] = share.round(1)
    df.loc[df["status"].isin(["O"]), ["own_gpp", "own_cash"]] = 0.0
    df["source_count"] = df["sources"].map(lambda s: len([x for x in s.split(";") if x != "est"]))
    cols = ["name", "team", "opp", "pos", "salary", "median", "floor", "ceiling", "own_cash", "own_gpp", "status",
            "p_play", "late_swap_risk", "implied_total", "source_count", "sources", "confidence", "notes"]
    return df[cols], t


def checks(df: pd.DataFrame, t: pd.DataFrame) -> list[str]:
    out = []
    for _, g in t.assign(key=t.apply(lambda r: "-".join(sorted([r.team, r.opp])), axis=1)).groupby("key"):
        assert abs(g["implied_total"].sum() - g["total"].iloc[0]) < 0.01, g
    assert len(t) == 20
    for team in t["team"]:
        need = {"QB", "RB", "WR", "DST"}
        have = set(df.loc[(df.team == team) & (df["median"] > 0), "pos"])
        if not need <= have:
            out.append(f"{team} missing {need - have}")
        if "TE" not in have:
            out.append(f"{team}: no TE1 projected (role unverified)")
    assert not ((df.status == "O") & (df["median"] > 0)).any()
    assert not df.duplicated(["name", "team"]).any()
    for col in ("own_cash", "own_gpp"):
        s = df[col].sum()
        out.append(f"{col} sum = {s:.0f}%")
        assert 800 <= s <= 1000, s
    # team skill totals vs implied (exclude backups who only play if starter sits, and Q players weighted by p_play)
    sk = df[df.pos.isin(["QB", "RB", "WR", "TE"])].copy()
    backup = sk["notes"].str.contains("only if|Only if|Starts only", regex=True)
    sk = sk[~backup]
    sk["exp"] = sk["median"] * sk["p_play"]
    g = sk.groupby("team").agg(pts=("exp", "sum"), implied=("implied_total", "first"))
    g["ratio"] = g["pts"] / g["implied"]
    med = g["ratio"].median()
    g["dev"] = g["ratio"] / med - 1
    for team, r in g.iterrows():
        if abs(r["dev"]) > 0.15:
            out.append(f"TEAM FLAG {team}: skill pts {r['pts']:.1f} vs implied {r['implied']:.1f} "
                       f"({r['dev']:+.0%} vs slate norm)")
    out.append("team ratio table:\n" + g.round(2).sort_values("dev").to_string())
    return out


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    df, t = build()
    for line in checks(df, t):
        print(line)
    df.to_csv(OUT / f"claude_projections_{DATE}_{MODE}.csv", index=False)
    t.to_csv(OUT / f"claude_teams_{DATE}_{MODE}.csv", index=False)
    print(len(df), "players ->", OUT)
