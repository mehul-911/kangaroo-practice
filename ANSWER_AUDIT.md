# Answer audit (how every key was verified)

Sources used
1. **IKMC answer sheets (Kangaroo Pakistan, the edition your 2012-2023 papers come from)** - ikmc.kangaroo.org.pk
2. **Math Kangaroo USA official answer keys** (mathkangaroo.org) - the authority for the 2024 and 2025 papers
3. My own independent solution of questions where the two sources disagreed, plus all of 2015 (by reasoning, image analysis or simulation)

Result
* 2013, 2014, 2018, 2020, 2021: IKMC and USA keys identical.
* 2012, 2016, 2017, 2019, 2022, 2023: identical except the questions listed below; each was solved independently.
* 2015: the USA key is ordered differently from this paper after Q3, so IKMC was used and all 24 answers were re-derived/confirmed.
* 2024, 2025: USA official keys (these are the USA tests).

Corrections made versus the first release (old -> new)
| Paper | Q | Old | New | How settled |
|---|---|---|---|---|
| 2015 | 4,5,8,9,10-22 | USA key | IKMC key | re-solved every one |
| 2016 | 21 | B | A | 99-60-12=27 -> 9 threes; 72-51 = 21 failed |
| 2017 | 15 | C | A | route A is outermost + notch, longest |
| 2017 | 19 | E | A | leave 4:35 (clock A) |
| 2017 | 20 | D | C | 40+35 vs 45+15+10 = 75 min |
| 2019 | 23 | B | D | exactly one liar only if Bartek ate it |
| 2019 | 24 | D | A | 16 + 10 camels = 26 hats |
| 2022 | 2 | B | E | wheel colour sequences computed |
| 2022 | 16 | B | C | mirrored shapes computed |
| 2022 | 18 | D | C | D is the mirror image |
| 2022 | 19 | E | B | path traced |
| 2022 | 23 | A | C | 4 x 7 = 28 |
| 2023 | 23 | D | C | 43 is under 33 |
| 2023 | 24 | E | D | ring solved: green = 4 |

Open item
* **2012 Q7**: the IKMC sheet says C (7); my count of the picture (8x5 checkerboard, 12 of 20 grey tiles remain) and the USA key both give **B (8)**. B is used.

Please report any answer you believe is wrong; edit `tools/keys.json` and re-run `python3 tools/build_bank.py`.
