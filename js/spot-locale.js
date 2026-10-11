import { isEnglish, t } from './i18n.js';

const SEASON_EN = {
  'כל השנה': 'Year-round',
  קיץ: 'Summer',
  'אביב-סתיו': 'Spring–fall',
  'חורף-אביב': 'Winter–spring',
  'חורף–אביב': 'Winter–spring',
  'כשהים שקט': 'When the sea is calm',
  'אחרי הגשמים': 'After the rains',
  'אחרי שיטפונות': 'After flash floods',
  'תלוי בעונה': 'Depends on the season',
};

const HEIGHT_EN = {
  'כ־4 מטרים': 'About 4 m',
  '2–3מ׳ / 6–7מ׳ מהעמודים הכחולים': '2–3 m / 6–7 m from the blue poles',
  'גובה משוער כ־12–15 מטר': 'About 12–15 m (estimated)',
  'כ־3–4 מטרים': 'About 3–4 m',
  'כ־4 מטר': 'About 4 m',
};

const ROCKS_EN = {
  'נקודת קפיצה ספציפית עמוקה — מסביב סלעים.': 'A specific deep landing — rocks all around.',
  'קיימים סלעים צריך להיזהר.': 'There are rocks — be careful.',
};

/** English copy for catalog spots. Canonical Hebrew stays on `name` in seed. */
const SPOT_EN = {
  'akko-old-city': {
    name: 'Old Acre Walls',
    description: 'Jump from the walls of Old Acre. Height 9.5 m. Jumping is forbidden — signs ban climbing the wall. Intermediate. Park at the Old Acre lighthouse and walk about 5 minutes. Climb back on stone stairs built into the wall. A rock sits close to the wall — jump a bit farther out, and another rock if you go too deep. Year-round, but check the swell forecast; high waves make it dangerous.',
    warnings: 'Jumping from the walls is forbidden — signs ban climbing the wall.\nA rock is close to the wall — jump a bit farther. Another rock if you go deep.\nCheck the swell forecast before you come — dangerous in high waves.',
  },
  'zavitan-glasses': {
    name: 'Upper Zavitan Pools — The Glasses',
    description: 'Two adjacent pools on the Upper Zavitan trail — not Zavitan Waterfall. Two jumps: about 5 m and 7 m. Beginner-friendly, easy climb out. Very deep water. Waze: Yehudiya Nature Reserve. Paid entry via Yehudiya, or free via Katzrin; trail details are easy to find on Google. Best in spring and fall: the walk is hot in summer, the water is very cold in winter.',
    warnings: 'Jumping is forbidden in all reserve pools — waterfall and pools. Rangers often stop jumping.',
  },
  'zavitan-waterfall': {
    name: 'Zavitan Waterfall',
    description: 'The waterfall pool on Nahal Zavitan — not the Glasses pools. For experienced jumpers — the scramble to the ledges is not easy. Height depends how high you climb: about 7 m, 12 m, 15 m, and 20 m. Waze: Yehudiya Nature Reserve. Park at Yehudiya or Katzrin. Paid entry via Yehudiya, or free from Katzrin. Jumping is forbidden in the reserve, and rangers are often there.',
    warnings: 'Jumping is forbidden in all reserve pools — waterfall and pools. Rangers often stop jumping.\nFor experienced jumpers — the climb to the jump points is not easy.',
  },
  'tiberias-bridge': {
    name: 'Tiberias Promenade Bridge',
    description: 'Jump from the Tiberias promenade bridge into the Kinneret. Three points: about 5 m, 6 m, and a high 8–10 m. Beginners and advanced. Waze: Tiberias Promenade; park nearby and walk to the pin. Water is deep, but always check yourself. Entry is forbidden — fenced in recent years, with many rangers.',
    warnings: 'The area was fenced in recent years and entry is forbidden.\nMany rangers can fine you and remove you.\nWatch for boats.\nWater is deep, but check yourself before every jump.',
  },
  'alumot-dam': {
    name: 'Alumot Dam',
    description: 'Jump from the dam bridge into the stepped pools below. A concrete bridge over a terraced fall — classic 3–4 m spot. Beautiful, beginner-friendly. Full year-round.',
    warnings: 'Low height. Check for rocks at the landing.',
  },
  'migdal-reading': {
    name: 'Reading Promenade Bridge — Tel Aviv',
    description: 'Bridge on the Reading promenade by the tower in Tel Aviv. About 7 m. For experienced jumpers because of the climb out. Rangers sometimes pass. Jumping is banned. Waze: Lighthouse Café Tel Aviv, then continue north on the promenade to the bridge.',
    warnings: 'Signs forbid jumping.\nPumps on site are active.\nHard to climb out because the area is fenced.\nFor experienced jumpers — because of the climb out.\nRangers sometimes pass.',
  },
  'aqua-kef': {
    name: 'Wipeout / Aqua Kef — Kinneret',
    description: 'Inflatable water park on the Kinneret near Tiberias. Controlled jumps about 6–8 m. Intermediate. Paid entry.',
    warnings: 'Paid park. Jump only from designated features, usually with a life vest. Open mainly in summer.',
  },
  'jordan-pipe-bridge': {
    name: 'Pipe Bridge — Yardenit',
    description: 'A pipe crossing the river (not a road bridge) — an iron pipe over the Jordan inside the Yardenit compound. About 3.5 m. Exact depth not listed. Beginner-friendly. There is also a separate tall-tree spot on site.',
    warnings: 'Unverified. This is a pipe over the river — not a road bridge. Low height. Farm structure. Check depth and obstacles before jumping. Depth in meters not listed.',
  },
  'yardenit-tree': {
    name: 'Tall Tree — Yardenit',
    description: 'Jump from a tall eucalyptus at Yardenit, on the west bank between the Israel Trail and the Jordan. 7 m. Right by the tree there is also a great rope swing. Depth varies by season, about 2–3 m. Intermediate.',
    warnings: 'Climbing the tree is dangerous. Depth varies by season (about 2–3 m) — always check yourself before jumping.',
  },
  'eilat-katza': {
    name: 'Katza Beach Bridge — Eilat',
    description: 'Industrial pier at Katza beach in Eilat. Intermediate. Three jumps: 3 m, 7 m, and 10 m. Farther along the pier, the water is deeper.',
    warnings: 'Not always accessible — the pier is fenced and sometimes closed.\nMarine police sometimes pass and can send you away or fine you.\nNo rocks in the water, but check depth before every jump.',
  },
  'ginosar-beach': {
    name: 'Ginosar Pier',
    description: 'Three jump points on the pier: about 2 m from the bridge itself, about 6 m from the iron poles, and about 8 m from the tall post. Climbing the two high points is dangerous. Experienced jumpers only.',
    warnings: 'Entry to the bridge is fenced and forbidden.\nThe climb to the 8 m jump is dangerous.\nDepth depends on the Kinneret level — never assume it is deep. Check before every jump.\nWatch for boats.',
  },
  'tel-dor': {
    name: 'Tel Dor Reserve',
    description: 'Jump from a rock at Tel Dor into a beautiful natural pool. Access via Tel Dor reserve or Nahsholim. Beginner-friendly. Deep only at a specific point you must aim for, so it is less comfortable and not great for flips.',
    warnings: 'High waves make this very dangerous — waves smash hard into the rocks. Deep only at a specific landing you must hit; rocks all around.',
    rocks: 'A specific deep landing — rocks all around.',
    season: 'When the sea is calm',
  },
  meshushim: {
    name: 'Hexagon Pool',
    description: 'Basalt pool on Nahal Meshushim in the Golan. Details still need field verification. Intermediate.',
    warnings: 'Still unverified — estimated height and unknown depth. Do not jump without a thorough check.',
  },
  'ein-sataf': {
    name: 'Ein Sataf',
    description: 'Spring near Jerusalem. About a 4 m jump into deep water.',
    warnings: '',
    height: 'About 4 m',
  },
  'ein-akev': {
    name: 'Ein Akev',
    description: 'Desert spring near Midreshet Ben-Gurion. Two jumps into the same pool — about 7 m for beginners, about 18 m for experienced jumpers. Same depth for both. Full year-round. Waze: Serpentine parking. About a 1.5 hour walk from the regular lot; 4x4 can get within about 400 m. Cold water.',
    warnings: 'Rangers sometimes.\nThe 7 m jump is beginner-friendly — the scramble is a bit slippery.\nThe 18 m jump is for experienced jumpers — not recommended without prior experience.\nSame depth for both jumps. Cold water. Desert hike.',
  },
  'kishon-bridge': {
    name: '⚠️ Kishon Stream Bridge',
    description: 'Road bridge over the Kishon, about 5.5 m. Depth about 2 m. Not recommended — the water is very polluted.',
    warnings: 'Not recommended — the water is very polluted.\nDepth about 2–2.5 m (changes after rain). Jump from the road-bridge railing.',
  },
  'dafna-raz': {
    name: 'Dafna / Dolev Reservoir',
    description: 'Dafna Reservoir, also known as Dolev. Two jumps: 2–3 m at the low jump, and 6–7 m from the blue poles. Depth varies by season, about 2–4 m, and the reservoir is empty in summer. Beginner-friendly.',
    warnings: '',
    height: '2–3 m / 6–7 m from the blue poles',
    season: 'After the rains',
  },
  'gilad-reservoir': {
    name: 'Gilad Reservoir',
    description: 'Gilad Reservoir in Ramot Menashe. About a 3 m jump from the bank. Beginner-friendly.',
    warnings: 'Water reservoir. Check depth and access rules before jumping.',
  },
  'rosh-hanikra': {
    name: 'Rosh Hanikra',
    description: 'About a 5 m jump from rocks into the sea at Rosh Hanikra, on the ridge below the lookout and the base. Beginner-friendly.',
    warnings: 'Dangerous — there is a rock below.\nJump from rocks into the sea, right on the ridge below the army base and lookout. Waves and currents.',
    rocks: 'There are rocks — be careful.',
  },
  'barak-vered': {
    name: 'Nahal Barak / Nahal Veredit',
    description: 'Pools in Nahal Barak and Nahal Veredit. Unclear if there is a jump. Not yet verified in the field.',
    warnings: 'Unverified — we have not visited.\nUnclear if there is a jump.\nPools only after floods. Dry in summer.',
    season: 'Winter–spring',
  },
  'tzalmon-bridge': {
    name: 'Nahal Tzalmon Bridge',
    description: 'Jump from a bridge over Nahal Tzalmon, about 4 m. Not great for flips. Enter the village, right at the roundabout, then first right again, continue to a dirt road. Park on dirt and walk a steep 5–10 minutes down to the bridge.',
    warnings: 'In summer the water is shallow, the stream is narrow, and you must aim the jump well.',
  },
  'prat-canyon': {
    name: 'Canyon Pool / Ein Shacharit — Nahal Prat',
    description: 'Canyon pool on Nahal Prat (Wadi Qelt), near Ein Shacharit. Beautiful and fun. Two jumps into a very narrow canyon: 3 m (easy) and 6.5 m (dangerous). On the high jump a rock must be cleared — jump far, but not too far because of another rock. Deep only at specific points. Not good for flips.',
    warnings: 'Two jumps: 3 m and 6.5 m. The 3 m is easy. The 6.5 m is dangerous — a rock to clear, jump far but not too far. The canyon is very narrow. Deep at specific points — check depth before jumping. Not good for flips. Descent from Nofei Prat / Mitzpe Shacharit.',
  },
  'white-waterfall': {
    name: 'The White Waterfall',
    description: 'The White Waterfall — part of the Nahal El Al trail. Two jumps: about 6 m and 18 m, same depth. The 18 m is very dangerous and not recommended — you must hit a very specific zone where max depth is under 3 m. The climb to the 6 m on the wall is not easy. The fall runs even in summer. More small pools with small jumps along the stream. Waze: Nahal El Al White Waterfall Eliad parking.',
    warnings: 'The 18 m jump is very dangerous — you must hit a very specific zone where max depth is under 3 m. Not recommended for anyone.\n6 m jump: the wall climb is not easy.\nSame depth for both. Check before every jump.',
  },
  'devora-fall': {
    name: 'Devora Waterfall',
    description: 'Devora Waterfall on Nahal Gilbon, on the way to Gilbon Waterfall. Three jumps: 19 m, 15 m, and 3 m. For experienced jumpers. Full year-round. Waze: Nahal Gilbon parking. About a 15-minute walk. Part of the pool is deep and part has rocks — check.',
    warnings: 'Three jumps: 19 m, 15 m, and 3 m.\nReserve, slippery rocks. Part of the pool is deep and part has rocks — check. Check depth before every jump.',
  },
  'nahal-shokh': {
    name: 'Nahal Shokh Waterfalls',
    description: 'Nahal Shokh waterfalls. Unknown if there is a jump. Not yet verified in the field.',
    warnings: 'Unverified — we have not visited.\nUnclear if there is a jump. Do not jump based on this page.',
    season: 'Winter–spring',
  },
  sonsal: {
    name: 'Sonsal / Sosnal Pool — Mitzpe Dani',
    description: 'Sonsal pool (also Sosnal) near Mitzpe Dani. Not yet verified in the field.',
    warnings: 'Unverified — we have not visited.\nUnclear if there is a jump. Do not jump based on this page.',
    season: 'Winter–spring',
  },
  'saar-fall': {
    name: 'Saar Waterfall',
    description: 'Saar Waterfall in the northern Golan. Very high jump. For experienced jumpers. Flows only in winter after rain and floods. Not yet verified in the field.',
    warnings: 'Jump not yet verified — depth and height still unknown. The fall flows only after rain and floods.',
    height: 'About 12–15 m (estimated)',
    season: 'After flash floods',
  },
  'ein-ayit': {
    name: 'Aniam Pool',
    description: 'Aniam pool on Nahal Ayit. Full year-round. Beginner-friendly.',
    warnings: '',
    height: 'About 3–4 m',
  },
  'beit-zayit-dam': {
    name: 'Beit Zayit Dam',
    description: 'Beit Zayit dam and reservoir near Jerusalem. Unclear if there is a jump. Not yet verified in the field.',
    warnings: 'Unverified — we have not visited.\nUnclear if there is a jump. Do not jump based on this page.',
    season: 'Winter–spring',
  },
  'zin-reservoir': {
    name: 'Zin Reservoir',
    description: 'Zin Reservoir in the Negev. There may be a jump. Not yet verified in the field.',
    warnings: 'Unverified — we have not visited.\nUnclear if there is a jump. Do not jump based on this page.',
    season: 'Winter–spring',
  },
  'eilat-obs-roof': {
    name: 'Underwater Observatory Roof',
    description: 'A spot we are still filling in.',
    warnings: '',
  },
  zerchan: {
    name: 'Zerchan Pool',
    description: 'Zerchan pool in the Judean Desert. Not yet verified in the field.',
    warnings: 'Unverified — we have not visited.\nUnclear if there is a jump. Do not jump based on this page.',
    season: 'Winter–spring',
  },
  tzafira: {
    name: 'Tzafira Pool',
    description: 'Tzafira pool on Nahal Tzeelim — a deep pool at the lip of a waterfall. Community jumps of about 6 and 8 m. Beginner-friendly. Usually full year-round — especially after floods, but not only in winter–spring. Waze: Tzafira overnight parking. About a 3.5 km walk from the lot to the spring.',
    warnings: 'Deep pool at the top of a very high waterfall (the fall itself is not for jumping). Descent with pegs. Cliff edge is dangerous. Water mainly after floods.',
  },
  'bor-haela': {
    name: 'Bor HaEla',
    description: 'Bor HaEla near Beit Shemesh / Ela Valley. Not yet verified in the field.',
    warnings: 'Unverified — we have not visited.\nUnclear if there is a jump. Do not jump based on this page.',
    season: 'Winter–spring',
  },
  'geve-atak': {
    name: 'Atak Pools',
    description: 'Atak pools in the Judean Desert. Unclear if there is a jump and what the height is. Not yet verified in the field.',
    warnings: 'Unverified — we have not visited.\nUnclear if there is a jump. Do not jump based on this page.',
    season: 'Winter–spring',
  },
  'baptist-village': {
    name: 'Baptist Village — Yarkon',
    description: 'Spot at the Baptist Village on the Yarkon, about a 5-minute walk from parking. Three tree jumps — 3 m, 4 m, and 6 m. The 6 m is a hard climb — higher in the tree. There is also a nice rope swing. Beginner-friendly.',
    warnings: 'The climb to the 6 m jump is hard — it is higher in the tree.',
  },
  'iris-pool': {
    name: 'Iris Pool — Golan Heights',
    description: 'Iris Pool in the Golan. The waterfall flows only in winter and spring, but the pool is full year-round. It sits in a firing zone, so entry is only on Saturdays. About a 2 km walk with a challenging descent.',
    warnings: 'Firing zone — entry only on weekends.\nDepth and rocks in the water are unknown — check thoroughly.',
    season: 'Winter–spring',
  },
  'solomon-pools': {
    name: 'Solomon’s Pools — Bethlehem',
    description: 'Solomon’s Pools near Bethlehem. Not yet verified in the field.',
    warnings: 'Unverified — we have not visited.\nUnclear if there is a jump.\nSensitive security area. Check the situation before going.',
  },
  'kfar-blum-bridge': {
    name: 'Jordan Bridge — Kfar Blum',
    description: 'Bridge on the Jordan near Kfar Blum. Unclear if there is a jump. Not yet verified in the field.',
    warnings: 'Unverified — we have not visited.\nUnclear if there is a jump. Do not jump based on this page.',
  },
  'beit-hashita-quarry': {
    name: 'Beit Hashita Basalt Quarry',
    description: 'Basalt quarry near Beit Hashita. A beautiful pool and spring, beginner-friendly. You can jump along the whole pool — two heights: 5 m and 7.5 m. Easy climb out. Very deep water, but always check yourself. Full year-round unless they pump; better in summer. Waze: Beit Hashita basalt quarry, park there, about a 5-minute walk.',
    warnings: 'Active quarry — entry forbidden.\nThe path goes through the working quarry.\nThere may be work on site.\nThey sometimes pump the water.\nNo guarantee the water is not polluted.\nVery deep, but always check depth yourself before every jump.',
  },
  'fasael-pool': {
    name: 'Fasael Pool (Herod’s Pool)',
    description: 'Pool in the Jordan Valley, also called Herod’s Pool. Large pool about 40×40 m. 4 m jump. Depth about 2.5 m — check before. Rope swing and shaded sitting corners. In Area C. Waze: Herod’s Pool.',
    warnings: 'In Area C.\nCheck depth before every entry.',
  },
  'arik-bridge': {
    name: 'Arik Bridge',
    description: 'Arik Bridge on the Jordan north of the Kinneret. Little information, sent by a friend. Not yet verified in the field.',
    warnings: 'Unverified — we have not visited. A friend sent it, almost no info. Do not jump based on this page.',
  },
  'ein-al-fuqa': {
    name: 'Ein al-Fuqa',
    description: 'Ein al-Fuqa in Samaria. Unknown if there is a jump. Not yet verified in the field.',
    warnings: 'Unverified — we have not visited.\nSamaria — sensitive area. Go only in a group with proper security planning.',
  },
  'ein-yorkeam': {
    name: 'Ein Yorkeam',
    description: 'Ein Yorkeam in the Negev, near Route 25 between Dimona and the Dead Sea. Beginner-friendly. Great for flips. Two jump points, 3 m and 6 m. Depth varies across the pool, and in summer it is much shallower.',
    warnings: 'Depth varies across the pool, and in summer it is much shallower. Check depth before jumping.',
  },
  'yarkon-tree': {
    name: 'Yarkon Stream Tree',
    description: 'A tree on the Yarkon — not the Baptist Village. Two jumps: 4 m from mid-tree and 8 m from the top, plus a rope swing. Intermediate. Very close to Yarkon interchange. Easy access. Year-round, no rocks below.',
    warnings: 'Two jumps from the tree: 4 m mid-tree and 8 m from the top. There is also a rope swing. This is not the Baptist Village.',
  },
  'ein-ankor': {
    name: 'Ein Ankor Quarry',
    description: 'Ein Ankor quarry near Menahemia. Not yet verified in the field.',
    warnings: 'Quarry near Menahemia. Jump details unknown.',
  },
  'ein-gav': {
    name: 'Ein Gev',
    description: 'Ein Gev on the Kinneret. Three jumps: 1–2 m from the pier, 5 m from boats moored there, and 8 m from the pole. Intermediate. Climbing the pole is dangerous. Farther along the pier is deeper. Jumping is forbidden.',
    warnings: 'Jumping is forbidden.\nClimbing the 8 m pole is dangerous.\nFarther along the pier is deeper. Check depth before every jump.',
  },
  'dubdevan-pool': {
    name: 'Cherry Pool',
    description: 'Cherry Pool in the Golan, near Nimrod. A beautiful pool with about a 3–4 m jump. Beginner-friendly. Private land; unofficial entry at visitors’ own risk. Drive toward Nimrod, continue straight by car to the exact spot. You have to climb a fence to reach the pool.',
    warnings: 'Private land. Unofficial entry at your own risk. The pool is deep but objects may be in the water and the level can change — you must check yourself before jumping.',
  },
  'yehudiya-waterfall': {
    name: 'Yehudiya Waterfall',
    description: 'Entry via Yehudiya Reserve (paid), about a 45-minute walk to the fall. Beginner-friendly jump. Reserve rangers sometimes forbid jumping.',
    warnings: '',
  },
  'ein-mokesh': {
    name: 'Ein Mokesh',
    description: 'Ein Mokesh. Jump height varies with water level, between 2 and 5 m. Beginner-friendly.',
    warnings: '',
  },
  'ein-mokeshon': {
    name: 'Ein Mokeshon',
    description: 'Ein Mokeshon, a hidden pool about 2 minutes from the better-known Ein Mokesh pool.',
    warnings: 'The area around the pool and along the approach was cleared of mines. Do not leave the clear paths that lead to the pool.',
  },
  'jordan-river-bridge': {
    name: 'Jordan River Bridge',
    description: 'Bridge on the Jordan River. Two jumps: about 7 m and 9 m. Depth about 2.5 m in summer. Parking and the pin are the same place. Climbing a fence is required to get on the bridge — not safe.',
    warnings: 'You must climb a fence to get on the bridge — not safe.\nDepth about 2.5 m in summer — check yourself before every jump. Depth changes by season.',
  },
  'ein-ria': {
    name: 'Ein Ria',
    description: 'Spring in Samaria. Depth about 4 m. Locals built a wooden platform you can jump from — about 2 m. You can also jump from the shelter at about 5 m, but you need to jump relatively far. Waze: Ein Ria Neve Tzuf.',
    warnings: '',
  },
  'katzabiya-pool': {
    name: 'Katzabiya Pool',
    description: 'The pool is full year-round. Two jumps: 5–6 m and 10–11 m. Deep water. About a 1 km walk from Katzabiya junction to the pool. The descent is hard. Waze: Katzabiya junction.',
    warnings: '',
  },
  'neelam-lake': {
    name: 'The Hidden Lake',
    description: 'A large pool. Estimated depth — deep; there may be rocks at certain points. Estimated jump heights 4–8 m. Salty water.',
    warnings: '',
  },
  'hidden-fall-arugot': {
    name: 'Hidden Waterfall — Nahal Arugot',
    description: 'In Ein Gedi reserve. Estimated depth 4 m. Jump 3–4 m. Waze: Nahal Arugot Ein Gedi.',
    warnings: '',
  },
  'dudim-cave': {
    name: 'Dudim Cave',
    description: 'A 5 m waterfall. The pool is deep mainly after floods — depends on the season. 3 m jump and 5 m jump. Depth varies. Ein Gedi / Nahal David area. Waze: Dudim Cave.',
    warnings: '',
    season: 'Depends on the season',
  },
  'geve-menachem': {
    name: 'Menachem Pool — Nahal Akev',
    description: 'Above Ein Akev (a separate spot), about a 1 km walk from it. 2–3 m jump. Depth depends on the season — full mainly after rain, not full in summer.',
    warnings: '',
    season: 'Depends on the season',
  },
  'ein-arnon': {
    name: 'Ein Arnon',
    description: 'A developed spring in the Land of Springs (Jordan Valley, Beit She’an / Mechola area). Shade, steps into the water, and a diving board. 1.5 m from the board. Depth about 2–2.5 m — always check yourself. Waze: Ein Arnon.',
    warnings: 'Always check depth yourself before every jump — do not rely on this site.\nThe board and deck can be wet and slippery.',
  },
  'ein-yarmouk': {
    name: 'Ein Yarmouk',
    description: 'A spring in the Land of Springs (Jordan Valley, Beit She’an / Mechola area). 1.5 m from a board into the spring. Depth about 2–2.5 m — always check yourself. Waze: Ein Yarmouk.',
    warnings: 'Always check depth yourself before every jump — do not rely on this site.\nThe board and surfaces can be wet and slippery.',
  },
  'ein-gerar': {
    name: 'Ein Gerar',
    description: 'A spring in the Land of Springs (Jordan Valley, Beit She’an / Mechola area). 1–2 m jump. Waze: Ein Gerar.',
    warnings: 'Always check depth yourself before every jump — do not rely on this site.\nWet surfaces can be slippery.',
  },
  'ein-sukkot': {
    name: 'Ein Sukkot',
    description: 'A deep spring with a deck to jump from, in the Land of Springs (Jordan Valley, Beit She’an / Mechola area). Jump height not listed. Waze: Ein Sukkot.',
    warnings: 'Always check depth yourself before every jump — do not rely on this site.\nThe deck and surfaces can be wet and slippery.',
  },
  'einot-fasael': {
    name: 'Einot Fasael',
    description: 'A large pool on Nahal Fasael — not Herod’s Pool / Fasael Pool. Depth about 1.5 m (shallow). Nature reserve, free entry. You can jump from 3 m, but the water is shallow — 3 m into 1.5 m is dangerous. Waze: Einot Fasael.',
    warnings: 'Shallow water — only about 1.5 m. You can jump from about 3 m, but that is a dangerous shallow landing.\nDo not jump without checking depth yourself. This is not a deep spot.\nNature reserve — take care of the place.',
  },
  'ein-gev-pillars': {
    name: 'Old Pillars in the Water',
    description: 'Old pillars sticking out of the water at Ein Gev beach. A short swim to reach them. Requires climbing. Beginner-friendly.',
    warnings: 'The pillars are old and the climb can be tricky. Dangerous to jump in strong waves.',
    height: 'About 4 m',
  },
  'ein-rashesh': {
    name: 'Ein Rashesh',
    description: 'A small, pretty spring between Samaria and the Jordan Valley. A short walk with signs. There is a deck you can jump from. Beginner-friendly.',
    warnings: '',
  },
  'deir-samean': {
    name: 'Deir Samean',
    description: 'Deir Samean. Two jumps: 3 m and 6 m. Beginner-friendly.',
    warnings: '',
  },
  'ein-samia': {
    name: 'Ein Samia',
    description: 'Ein Samia. 3 m jump. Depth about 2 m. Beginner-friendly. Waze: Ein Samia.',
    warnings: '',
  },
};

function enEntry(spot) {
  const id = spot && typeof spot === 'object' ? spot.id : spot;
  return SPOT_EN[String(id || '')] || null;
}

export function englishSpotName(spot) {
  return enEntry(spot)?.name || '';
}

export function displaySpotName(spot, fallback = '') {
  const obj = spot && typeof spot === 'object' ? spot : null;
  const name = obj?.name || fallback || '';
  if (!isEnglish()) return name;
  return enEntry(spot)?.name || obj?.name_en || name;
}

export function displaySpotDescription(spot) {
  if (!spot) return '';
  if (isEnglish()) return enEntry(spot)?.description || spot.description_en || spot.description || '';
  return spot.description || '';
}

export function displaySpotWarnings(spot) {
  if (!spot) return '';
  if (isEnglish()) {
    const en = enEntry(spot);
    if (en && Object.prototype.hasOwnProperty.call(en, 'warnings')) return en.warnings || '';
    return spot.warnings_en || spot.warnings || '';
  }
  return spot.warnings || '';
}

export function displaySpotSeason(spot) {
  const raw = String(spot?.season || '').trim();
  if (!raw) return t('common.allYear');
  if (!isEnglish()) return raw;
  return enEntry(spot)?.season || SEASON_EN[raw] || raw;
}

export function displaySpotRocks(spot) {
  const raw = String(spot?.rocks ?? spot?.rocks_below ?? '').trim();
  if (!isEnglish()) {
    if (!raw || raw === 'אין') return t('rocks.none');
    if (raw === 'לא ידוע') return t('rocks.unknown');
    return raw;
  }
  if (enEntry(spot)?.rocks) return enEntry(spot).rocks;
  if (!raw || raw === 'אין' || raw.toLowerCase() === 'none') return t('rocks.none');
  if (raw === 'לא ידוע' || raw.toLowerCase() === 'unknown') return t('rocks.unknown');
  return ROCKS_EN[raw] || raw;
}

export function displaySpotHeightLabel(spot) {
  const custom = String(spot?.height_label || '').trim();
  if (!custom) return '';
  if (!isEnglish()) return custom;
  return enEntry(spot)?.height || HEIGHT_EN[custom] || custom;
}

export function spotSearchHaystack(spot) {
  const parts = [
    spot?.name,
    englishSpotName(spot),
    spot?.name_en,
    spot?.id,
    ...(Array.isArray(spot?.aliases) ? spot.aliases : []),
  ];
  return parts.map((p) => String(p || '').toLowerCase()).join('\n');
}

export function spotNameEquals(spot, typed) {
  const value = String(typed || '').trim();
  if (!value) return false;
  const names = [spot?.name, englishSpotName(spot), spot?.name_en]
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  return names.includes(value);
}
