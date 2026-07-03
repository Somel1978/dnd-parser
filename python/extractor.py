"""
Grant extractor — spaCy PhraseMatcher + targeted regex.
stdin:  {"descriptions": [{"id": 0, "text": "..."}, ...]}
stdout: progress lines {"progress": N}, then {"done": true, "results": [...]}
"""
import sys, json, re
import spacy
from spacy.matcher import PhraseMatcher

SKILLS = ['Acrobatics','Animal Handling','Arcana','Athletics','Deception','History',
          'Insight','Intimidation','Investigation','Medicine','Nature','Perception',
          'Performance','Persuasion','Religion','Sleight of Hand','Stealth','Survival']
TOOLS = ["Alchemist's Supplies","Brewer's Supplies","Calligrapher's Supplies",
         "Carpenter's Tools","Cartographer's Tools","Cobbler's Tools","Cook's Utensils",
         "Disguise Kit","Forgery Kit","Glassblower's Tools","Herbalism Kit","Jeweler's Tools",
         "Leatherworker's Tools","Mason's Tools","Navigator's Tools","Painter's Supplies",
         "Poisoner's Kit","Potter's Tools","Smith's Tools","Thieves' Tools","Tinker's Tools",
         "Weaver's Tools","Woodcarver's Tools","Gaming Set","Musical Instrument"]
ARTISAN_TOOLS = ["Alchemist's Supplies","Brewer's Supplies","Calligrapher's Supplies",
                 "Carpenter's Tools","Cartographer's Tools","Cobbler's Tools","Cook's Utensils",
                 "Glassblower's Tools","Jeweler's Tools","Leatherworker's Tools","Mason's Tools",
                 "Painter's Supplies","Potter's Tools","Smith's Tools","Tinker's Tools",
                 "Weaver's Tools","Woodcarver's Tools"]
LANGUAGES = ['Abyssal','Aquan','Auran','Celestial','Common','Deep Speech','Draconic',
             'Druidic','Dwarvish','Elvish','Giant','Gnomish','Goblin','Gnoll','Halfling',
             'Ignan','Infernal','Orc','Primordial','Sylvan','Terran','Thieves Cant','Undercommon']
STATS = ['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma']
WORD_NUMS = {'another':1,'one':1,'a':1,'an':1,'two':2,'three':3,'four':4,
             'five':5,'six':6,'seven':7,'eight':8}

SKILL_CANON = {s.lower():s for s in SKILLS}
TOOL_CANON  = {t.lower():t for t in TOOLS}
LANG_CANON  = {l.lower():l for l in LANGUAGES}

nlp = spacy.blank('en')
nlp.add_pipe('sentencizer')

def make_matcher(items):
    m = PhraseMatcher(nlp.vocab, attr='LOWER')
    m.add('M', [nlp.make_doc(i) for i in items])
    return m

skill_m = make_matcher(SKILLS)
tool_m  = make_matcher(TOOLS)
lang_m  = make_matcher(LANGUAGES)

CURLY = str.maketrans('\u2018\u2019\u201a\u201b\u02bc', "'''''" )

def clean(text):
    text = text.translate(CURLY)
    text = re.sub(r'<[^>]+>', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()

def find_n(text):
    m = re.search(r'\b(another|one|two|three|four|five|six|a|\d+)\b', text, re.I)
    if not m: return 0
    s = m.group(1).lower()
    return WORD_NUMS.get(s) or (int(s) if s.isdigit() else 0)

def section_after(text, pat):
    m = re.search(pat, text, re.I)
    if not m: return None
    after = text[m.end():]
    stop = re.search(r'\b(?:Skills?|Tools?|Languages?|Saving\s+Throws?|Weapons?|Armor)\s*[:\t]', after, re.I)
    return after[:stop.start()].strip() if stop else after[:300].strip()

def win(doc, s, e, b=12, a=8):
    return doc[max(0,s-b):min(len(doc),e+a)]

def has_prof(span):  return any(t.text.lower().startswith('proficien') for t in span)
def has_choice(span):return any(t.text.lower() in ('choose','choice','chosen','pick','select') for t in span)
def has_gain(span):  return any(t.text.lower() in ('gain','have','learn','know','speak') for t in span)
def find_stats(s):   return [st for st in STATS if st.lower() in s.lower()]


def extract(raw):
    text = clean(raw)
    tl = text.lower()
    if not any(k in tl for k in ('proficien','expertise','language','choose','learn','saving throw','saves:','cast','innate','darkvision','blindsight','tremorsense','truesight','speed','resistance','immune','vulnerab','speak','write')):
        return {}

    doc = nlp(text)
    r = {}

    # ── SKILLS ────────────────────────────────────────────────────────────────
    # 1. Labeled section
    sec = section_after(text, r'Skills?(?:\s+Proficiencies?)?\s*[:\t]')
    if sec:
        n_m = re.search(r'Choose\s+(?:any\s+)?(\w+)', sec, re.I)
        n = WORD_NUMS.get(n_m.group(1).lower(),0) if n_m else 0
        if n:
            pool = [SKILL_CANON[s] for s in SKILL_CANON if s in sec.lower()]
            r['skillChoiceCount'] = n
            r['skillChoicePool'] = ','.join(pool) or ','.join(SKILLS)
        else:
            found = [SKILL_CANON[s] for s in SKILL_CANON if s in sec.lower()]
            if found: r['grantsSkills'] = ','.join(found)

    # 2. Expertise
    if 'expertiseChoiceCount' not in r and re.search(r'\b(?:expertise|doubled)\b', tl):
        exp_m = re.search(
            r'(?:Expertise\s+in|choose)\s+(one|two|three|another|\d+)\s+(?:more\s+)?'
            r'(?:of\s+(?:your\s+)?)?(?:skill\s+proficiencies?|skills?)', text, re.I)
        if exp_m:
            n = find_n(exp_m.group(0))
            pool = [SKILL_CANON[s] for s in SKILL_CANON if s in tl]
            r['expertiseChoiceCount'] = n or 2
            r['expertiseChoicePool'] = ','.join(pool) or ','.join(SKILLS)

    # 3. Skill count without individual names ("three skills of your choice")
    if 'skillChoiceCount' not in r and 'grantsSkills' not in r and 'expertiseChoiceCount' not in r:
        cm = re.search(
            r'(?:proficien\w*\s+(?:in|with)|gain|choose|have)'
            r'\s+(one|two|three|four|five|another|\d+)\s+'
            r'(?:more\s+)?(?:additional\s+)?(?:of\s+(?:your\s+)?)?'
            r'(?:skill\s+proficiencies?|skills?)(?:\s+(?:of\s+your\s+choice|from\b))?',
            text, re.I
        ) or re.search(
            r'(one|two|three|four|five|another|\d+)\s+(?:more\s+)?(?:additional\s+)?skill\s+proficiencies?\b',
            text, re.I
        )
        if cm:
            n = find_n(cm.group(0))
            if n:
                after = text[cm.end():cm.end()+300]
                list_m = re.search(
                    r'(?:from(?:\s+(?:among|the\s+following))?|following\s+skills?)[^:]*:?\s*'
                    r'([A-Za-z,\s]+?)(?:\.|;|$)', after, re.I)
                pool = []
                if list_m:
                    for part in re.split(r'[,\s]+(?:and\s+|or\s+)?', list_m.group(1)):
                        k = part.strip().lower()
                        if k in SKILL_CANON: pool.append(SKILL_CANON[k])
                r['skillChoiceCount'] = n
                r['skillChoicePool'] = ','.join(pool) or ','.join(SKILLS)

    # 4. PhraseMatcher for named skills
    if 'skillChoiceCount' not in r and 'grantsSkills' not in r and 'expertiseChoiceCount' not in r:
        grants, choices = [], []
        for _, s, e in skill_m(doc):
            span = win(doc, s, e)
            if not (has_prof(span) or has_gain(span)): continue
            name = SKILL_CANON.get(doc[s:e].text.lower(), doc[s:e].text)
            (choices if has_choice(span) else grants).append(name)
        if choices:
            n = find_n(text) or 1
            r['skillChoiceCount'] = n
            r['skillChoicePool'] = ','.join(dict.fromkeys(choices)) if len(choices)>n else ','.join(SKILLS)
        elif grants:
            r['grantsSkills'] = ','.join(dict.fromkeys(grants))

    # 5. Half proficiency
    if re.search(r'half\s+(?:your\s+)?proficiency\s+bonus.{0,80}any\s+ability\s+check', tl):
        r['grantsHalfSkills'] = ','.join(SKILLS)

    # ── SAVING THROWS ────────────────────────────────────────────────────────
    if 'grantsSavingThrows' not in r:
        # Gate ALL saving throw patterns on a fast keyword check first —
        # the inline pattern has nested quantifiers that backtrack catastrophically
        # on long texts that contain "proficiency in" but no "saving throws".
        if 'saving throw' in tl or 'saves:' in tl:
            if re.search(r'proficien\w*\s+in\s+all\s+saving\s+throws?', tl):
                r['grantsSavingThrows'] = ','.join(STATS)
            else:
                for pat in [
                    r'Saving\s+Throw\s+Proficiencies?[:\t]\s*(.{0,200})',
                    r'Saving\s+Throws?[:\t]\s*(.{0,200})',
                    r'Saves?[:\t]\s*([A-Za-z,&\s]{3,60}?)(?:\s*<|\s*$|\n)',
                    r'Saving\s+Throw\s+Proficiencies\s+([A-Z][a-z]+(?:\s+and\s+[A-Z][a-z]+)*)',
                    # Simple bounded class — no nested quantifiers
                    r'proficien\w*\s+in\s+([A-Za-z,\s]{3,60})\s+saving\s+throws?',
                ]:
                    m = re.search(pat, text, re.I)
                    if m:
                        found = find_stats(m.group(1))
                        if found: r['grantsSavingThrows'] = ','.join(found); break

    # ── TOOLS ─────────────────────────────────────────────────────────────────
    if 'toolChoiceCount' not in r and 'grantsTools' not in r:
        sec = section_after(text, r'Tools?\s+Proficiencies?[:\t]')
        if sec:
            n_m = re.search(r'Choose\s+(?:any\s+)?(\w+)', sec, re.I)
            n = WORD_NUMS.get(n_m.group(1).lower(),0) if n_m else 0
            if n:
                pool = [TOOL_CANON[t] for t in TOOL_CANON if t in sec.lower()]
                r['toolChoiceCount'] = n
                r['toolChoicePool'] = ','.join(pool) or (','.join(ARTISAN_TOOLS) if 'artisan' in sec.lower() else ','.join(TOOLS))
            else:
                found = [TOOL_CANON[t] for t in TOOL_CANON if t in sec.lower()]
                if found: r['grantsTools'] = ','.join(found)

    if 'toolChoiceCount' not in r and 'grantsTools' not in r:
        tm = re.search(
            r'proficien\w*\s+with\s+(one|two|three|four|\d+)\s+'
            r'(?:(?:type(?:s)?\s+of|different)\s+)?'
            r"(Artisan.{0,8}Tools?|Musical\s+Instruments?|Gaming\s+Sets?|tools?)"
            r'(?:\s+of\s+your\s+choice)?', text, re.I
        ) or re.search(
            r'(one|two|three|four|\d+)\s+tool\s+proficiencies?\s+of\s+your\s+choice', text, re.I
        )
        if tm:
            n = find_n(tm.group(0))
            seg = tm.group(0).lower()
            pool = 'Musical Instrument' if 'musical' in seg else \
                   'Gaming Set' if 'gaming' in seg else \
                   ','.join(ARTISAN_TOOLS) if 'artisan' in seg else ','.join(TOOLS)
            r['toolChoiceCount'] = n; r['toolChoicePool'] = pool

    if 'toolChoiceCount' not in r and 'grantsTools' not in r:
        grants = []
        for _, s, e in tool_m(doc):
            span = win(doc, s, e)
            nb = span.text.lower()
            if not (has_prof(span) or has_gain(span) or
                    'proficiency with it' in nb or 'proficient with it' in nb): continue
            name = TOOL_CANON.get(doc[s:e].text.lower(), doc[s:e].text)
            if not has_choice(span): grants.append(name)
        if grants: r['grantsTools'] = ','.join(dict.fromkeys(grants))

    # ── LANGUAGES ─────────────────────────────────────────────────────────────
    if 'languageChoiceCount' not in r and 'grantsLanguages' not in r:
        sec = section_after(text, r'Languages?\s+Proficiencies?[:\t]')
        if sec:
            n_m = re.search(r'(one|two|three|four|\d+)', sec, re.I)
            n = WORD_NUMS.get(n_m.group(1).lower(),1) if n_m else 1
            if re.search(r'choose|your\s+choice', sec, re.I):
                pool = [LANG_CANON[l] for l in LANG_CANON if l in sec.lower()]
                r['languageChoiceCount'] = n
                r['languageChoicePool'] = ','.join(pool) or ','.join(LANGUAGES)
            else:
                found = [LANG_CANON[l] for l in LANG_CANON if l in sec.lower()]
                if found: r['grantsLanguages'] = ','.join(found)
                else: r['languageChoiceCount'] = n; r['languageChoicePool'] = ','.join(LANGUAGES)

    if 'languageChoiceCount' not in r and 'grantsLanguages' not in r:
        lm = re.search(
            r'(?:learn|know|speak)\s+(one|two|three|\d+)\s+(?:additional\s+)?languages?\s+'
            r'(?:of\s+your\s+choice|you\s+(?:roll|choose))', text, re.I
        ) or re.search(r'(?:learn|know)\s+one\s+(?:additional\s+)?language\b', text, re.I) \
          or re.search(r'one\s+language\s+of\s+your\s+choice', text, re.I)
        if lm:
            r['languageChoiceCount'] = max(find_n(lm.group(0)), 1)
            r['languageChoicePool'] = ','.join(LANGUAGES)
        else:
            grants = []
            for _, s, e in lang_m(doc):
                span = win(doc, s, e)
                if has_prof(span) or has_gain(span):
                    name = LANG_CANON.get(doc[s:e].text.lower(), doc[s:e].text)
                    # Exclude 'Draconic ancestry' and similar non-language uses
                    after_tok = doc[e].text.lower() if e < len(doc) else ''
                    if after_tok in ('ancestry', 'ancestor', 'heritage'): continue
                    if not has_choice(span): grants.append(name)
            if grants: r['grantsLanguages'] = ','.join(dict.fromkeys(grants))

    # ── INNATE SPELLS ─────────────────────────────────────────────────────────
    # Format: SpellName:minCharLevel:usesPerDay[:true]
    if 'cast' in tl or 'innate' in tl:
        innate_re = re.compile(
            r'(?:cast|use)\s+(?:the\s+|a\s+|an\s+)?'
            r'([A-Za-z][a-zA-Z\' -]+?)'
            r'(?:\s+(?:spell|cantrip|ability))?(?:\s+as\s+a\s+\d+(?:st|nd|rd|th)-level\s+spell)?(?:\s+\([^)]+\))?'
            r'\s+(?:at[\s-]will|(?:once|twice|\d+\s+times?)(?:\s+with\s+this\s+trait)?\s+(?:per\s+(?:day|long\s+rest|short\s+rest)|with\s+this\s+trait))', re.I
        )
        lv_re = re.compile(r'(?:starting\s+at|once\s+you\s+reach|when\s+you\s+reach|you\s+reach|at)\s+(\d+)(?:st|nd|rd|th)?\s*level', re.I)
        entries = []
        for m in innate_re.finditer(text):
            name = m.group(1).strip()
            if not name or len(name) < 2: continue
            name = ' '.join(w.capitalize() for w in name.split())
            before = text[max(0, m.start()-200):m.start()]
            lv_m = list(lv_re.finditer(before))[-1] if list(lv_re.finditer(before)) else None
            min_level = int(lv_m.group(1)) if lv_m else 1
            full = m.group(0).lower()
            if 'at will' in full or 'at-will' in full:
                uses = 0
            elif 'twice' in full:
                uses = 2
            else:
                nm = re.search(r'(\d+)\s+times?', full)
                uses = int(nm.group(1)) if nm else 1
            after = text[m.end():m.end()+200]
            can_slot = bool(re.search(r'using\s+(?:a\s+)?spell\s+slot|expend\s+(?:a\s+)?spell\s+slot', after, re.I))
            entry = f'{name}:{min_level}:{uses}'
            if can_slot: entry += ':true'
            entries.append(entry)
        # Also catch "you know the X cantrip" = at will
        know_re = re.compile(r'[Yy]ou\s+know\s+(?:the\s+)?([A-Za-z][a-zA-Z\' -]+?)\s+cantrip', re.I)
        for m in know_re.finditer(text):
            name = ' '.join(w.capitalize() for w in m.group(1).strip().split())
            if name and len(name) >= 2:
                entry = f'{name}:1:0'
                if entry not in entries: entries.append(entry)

        # Also catch "cast X with this trait ... long rest" (no explicit count = once)
        with_trait_re = re.compile(
            r'(?:cast|use)\s+(?:the\s+|also\s+)?([A-Za-z][a-zA-Z\'/\-\s]{2,40}?)\s+(?:as\s+a\s+\d+(?:st|nd|rd|th)-level\s+spell\s+)?(?:spell\s+)?with\s+(?:this\s+trait|it)'
            r'(?![^.]*(?:once|twice|\d+\s+times?))', re.I
        )
        for m in with_trait_re.finditer(text):
            name = ' '.join(w.capitalize() for w in m.group(1).strip().split())
            if not name or len(name) < 3 or name.lower() in ('a','the','it','that','either','both','a spell','the spell','any spell'): continue
            # Skip if this clause already has an explicit frequency (handled by main innate_re)
            clause_end = text.find('.', m.start())
            clause = text[m.start():clause_end] if clause_end > 0 else text[m.start():]
            if re.search(r'\b(?:once|twice|\d+\s+times?)\b', clause, re.I): continue
            # Skip 'or X' multi-spell cleanup phrases
            if re.search(r'\bor\b', m.group(1)): continue
            before = text[max(0, m.start()-200):m.start()]
            lv_matches = list(lv_re.finditer(before))
            lv_m = lv_matches[-1] if lv_matches else None
            min_level = int(lv_m.group(1)) if lv_m else 1
            entry = f'{name}:{min_level}:1'
            if entry not in entries: entries.append(entry)

        if entries:
            r['grantsInnateSpells'] = ','.join(dict.fromkeys(entries))

    # ── SENSES ────────────────────────────────────────────────────────────────
    if 'grantsSenses' not in r:
        senses = []
        for sense, pats in [
            ('Darkvision',  [
                # Grant context: gain/have darkvision
                r'(?:gain|grants?|gives?)\s+(?:you\s+)?(?:a\s+)?Darkvision\s+(?:with\s+a\s+range\s+of\s+)?(\d+)\s*(?:ft|feet)',
                # Range increase
                r'Darkvision\s+(?:range\s+)?(?:increase[sd]?\s+(?:by|to)|expands?\s+to)\s+(\d+)\s*(?:ft|feet)',
                r'(?:your\s+)?darkvision\s+(?:bonus\s+)?(?:increase[sd]?\s+(?:by|to)|expands?\s+to)\s+(\d+)\s*(?:ft|feet)',
            ]),
            ('Blindsight',  [
                r'(?:gain|grants?|gives?)\s+(?:you\s+)?(?:a\s+)?Blindsight\s+(?:with\s+a\s+range\s+of\s+)?(\d+)\s*(?:ft|feet)',
                r'Blindsight\s+(?:range\s+)?(?:increase[sd]?\s+(?:by|to))\s+(\d+)\s*(?:ft|feet)',
            ]),
            ('Tremorsense', [
                r'(?:gain|grants?|gives?)\s+(?:you\s+)?(?:a\s+)?Tremorsense\s+(?:with\s+a\s+range\s+of\s+)?(\d+)\s*(?:ft|feet)',
                r'Tremorsense\s+(?:range\s+)?(?:increase[sd]?\s+(?:by|to))\s+(\d+)\s*(?:ft|feet)',
            ]),
            ('Truesight',   [
                r'(?:gain|grants?|gives?)\s+(?:you\s+)?(?:a\s+)?Truesight\s+(?:with\s+a\s+range\s+of\s+)?(\d+)\s*(?:ft|feet)',
                r'Truesight\s+(?:range\s+)?(?:increase[sd]?\s+(?:by|to))\s+(\d+)\s*(?:ft|feet)',
            ]),
        ]:
            for pat in pats:
                m = re.search(pat, text, re.I)
                if m:
                    senses.append(f'{sense} {m.group(1)} ft')
                    break
        if senses:
            r['grantsSenses'] = ', '.join(senses)

    # ── RESISTANCES / IMMUNITIES / VULNERABILITIES ─────────────────────────────
    DMG_TYPES = ['acid','bludgeoning','cold','fire','force','lightning','necrotic',
                 'piercing','poison','psychic','radiant','slashing','thunder']
    DMG_SET = set(DMG_TYPES)
    CONDITION_IMMUNITIES = ['disease','poisoned','frightened','charmed','exhaustion',
                            'paralyzed','petrified','prone','restrained','stunned',
                            'unconscious','blinded','deafened','aging']

    def extract_dmg_types(chunk):
        if re.search(r'\\ball\\b', chunk, re.I): return [t.capitalize() for t in DMG_TYPES]
        if re.search(r'associated with|determined by|your choice', chunk, re.I): return []
        found = []
        for word in re.split(r'[,\s]+|\band\b|\bor\b', chunk):
            w = word.replace('damage','').strip().lower()
            if w in DMG_SET and w.capitalize() not in found:
                found.append(w.capitalize())
        return found

    def find_dmg(patterns):
        found = []
        for pat in patterns:
            for m in re.finditer(pat, text, re.I):
                for t in extract_dmg_types(m.group(1)):
                    if t not in found: found.append(t)
        return ','.join(found)

    if 'grantsResistances' not in r:
        v = find_dmg([
            r'[Rr]esistance\s+(?:to|against)\s+([\w\s,]+?\s+damage(?:\s+and\s+[\w\s,]+?\s+damage)*)',
            r'[Rr]esistance\s+(?:to|against)\s+([\w,\s]+?)(?:\s+damage)',
            r'gain\s+resistance\s+to\s+([\w\s,]+?\s+damage)',
        ])
        if v: r['grantsResistances'] = v

    if 'grantsImmunities' not in r:
        dmg_v = find_dmg([
            r'[Ii]mmunit(?:y|ies)\s+to\s+([\w\s,]+?\s+damage(?:\s+and\s+[\w\s,]+?\s+damage)*)',
            r'[Ii]mmun(?:e|ity)\s+to\s+([\w,\s]+?)(?:\s+damage)',
        ])
        cond_found = []
        for m in re.finditer(r'immun(?:e|ity)\s+to\s+([^.;,]{3,50}?)(?=\s*[,;.]|\s+and\s+you|\s+you\s+have|$)', text, re.I):
            chunk = m.group(1).lower()
            for cond in CONDITION_IMMUNITIES:
                if cond in chunk and cond.capitalize() not in cond_found:
                    cond_found.append(cond.capitalize())
        all_v = ','.join(x for x in [dmg_v] + cond_found if x)
        if all_v: r['grantsImmunities'] = all_v

    if 'grantsVulnerabilities' not in r:
        v = find_dmg([
            r'[Vv]ulnerab(?:le|ility)\s+to\s+([\w\s,]+?\s+damage(?:\s+and\s+[\w\s,]+?\s+damage)*)',
            r'[Vv]ulnerab(?:le|ility)\s+to\s+([\w,\s]+?)(?:\s+damage)',
        ])
        if v: r['grantsVulnerabilities'] = v

    # ── SPEED (grantsSpeed — additive bonuses in TYPE:amount format) ──────
    if 'grantsSpeed' not in r:
        speeds = {}
        for sp_type, pats in [
            ('WALK', [
                r'walk(?:ing)?\s+speed\s+(?:bonus\s+)?increase[sd]?\s+(?:by|to)\s+(\d+)',
                r'base\s+speed\s+(?:bonus\s+)?increase[sd]?\s+(?:by|to)\s+(\d+)',
                r'unarmored\s+(?:speed|movement)\s+(?:bonus\s+)?increase[sd]?\s+(?:by|to)\s+(\d+)',
                r'your\s+speed\s+(?:bonus\s+)?increase[sd]?\s+(?:by|to)\s+(\d+)',
                r'increase[sd]?\s+your\s+speed\s+(?:by|to)\s+(\d+)',
            ]),
            ('FLY',    [
                r'fly(?:ing)?\s+speed\s+(?:bonus\s+)?increase[sd]?\s+(?:by|to)\s+(\d+)',
                r'increase[sd]?\s+your\s+fly(?:ing)?\s+speed\s+(?:by|to)\s+(\d+)',
            ]),
            ('SWIM',   [
                r'swim(?:ming)?\s+speed\s+(?:bonus\s+)?increase[sd]?\s+(?:by|to)\s+(\d+)',
                r'increase[sd]?\s+your\s+swim(?:ming)?\s+speed\s+(?:by|to)\s+(\d+)',
            ]),
            ('CLIMB',  [
                r'climb(?:ing)?\s+speed\s+(?:bonus\s+)?increase[sd]?\s+(?:by|to)\s+(\d+)',
                r'increase[sd]?\s+your\s+climb(?:ing)?\s+speed\s+(?:by|to)\s+(\d+)',
            ]),
            ('BURROW', [
                r'burrow(?:ing)?\s+speed\s+(?:bonus\s+)?increase[sd]?\s+(?:by|to)\s+(\d+)',
                r'increase[sd]?\s+your\s+burrow(?:ing)?\s+speed\s+(?:by|to)\s+(\d+)',
            ]),
        ]:
            for pat in pats:
                m = re.search(pat, text, re.I)
                if m and sp_type not in speeds:
                    speeds[sp_type] = m.group(1)
                    break
        if speeds:
            r['grantsSpeed'] = ','.join(f'{k}:{v}' for k, v in speeds.items())

    return r


def main():
    raw = sys.stdin.read()
    batch = json.loads(raw)
    items = batch.get('descriptions', [])
    total = len(items)
    results = []
    for i, item in enumerate(items):
        results.append({'id': item['id'], 'grants': extract(item.get('text',''))})
        if (i+1) % 50 == 0 or (i+1) == total:
            sys.stdout.write(json.dumps({'progress': round((i+1)/total*100)}) + '\n')
            sys.stdout.flush()
    sys.stdout.write(json.dumps({'done': True, 'results': results}) + '\n')
    sys.stdout.flush()

if __name__ == '__main__':
    main()