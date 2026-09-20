// Brand.location is free text. Recognize explicit country tokens; never infer
// a country from the default timezone or expose an address as a country label.
const codes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ')
const english = new Intl.DisplayNames(['en'], { type: 'region' })
const chinese = new Intl.DisplayNames(['zh-CN'], { type: 'region' })
const names = new Map<string, string>()
for (const code of codes) {
  for (const label of [code, english.of(code), chinese.of(code)]) {
    if (label) names.set(label.toLocaleLowerCase(), code)
  }
}
for (const [alias, code] of [['UK', 'GB'], ['USA', 'US'], ['UAE', 'AE'], ['中国香港', 'HK'], ['中国澳门', 'MO'], ['中国台湾', 'TW']]) names.set(alias.toLowerCase(), code)
export function countryLabel(location: string | null | undefined, en: boolean) {
  const tokens = (location || '').trim().split(/[,，/|·;；\n]+/).map(part => part.trim().toLocaleLowerCase()).filter(Boolean)
  const matched = [...new Set(tokens.map(token => names.get(token)).filter((code): code is string => !!code))]
  return matched.length === 1 ? (en ? english : chinese).of(matched[0]) || '—' : '—'
}
