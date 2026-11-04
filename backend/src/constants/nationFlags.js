const ISO2_BY_CODE = Object.freeze({
  MEX: 'MX', CAN: 'CA', USA: 'US', ESP: 'ES', FRA: 'FR', ARG: 'AR', BRA: 'BR', GER: 'DE', POR: 'PT', NED: 'NL',
  ITA: 'IT', BEL: 'BE', CRO: 'HR', SUI: 'CH', DEN: 'DK', AUT: 'AT', TUR: 'TR', URU: 'UY', COL: 'CO', KOR: 'KR',
  JPN: 'JP', MAR: 'MA', SEN: 'SN', UKR: 'UA', SWE: 'SE', POL: 'PL', ECU: 'EC', PAR: 'PY', CHI: 'CL', NGA: 'NG',
  EGY: 'EG', CIV: 'CI', ALG: 'DZ', IRN: 'IR', AUS: 'AU', CMR: 'CM', GHA: 'GH', TUN: 'TN', KSA: 'SA', QAT: 'QA',
  UZB: 'UZ', IRQ: 'IQ', CRC: 'CR', PAN: 'PA', JAM: 'JM', HON: 'HN', NZL: 'NZ',
});

const REGIONAL_INDICATOR_BASE = 0x1f1e6;

// 잉글랜드는 ISO 국가 코드가 아닌 서브디비전 태그 시퀀스(GB-ENG) 이모지를 사용
const ENGLAND_FLAG = String.fromCodePoint(
  0x1f3f4,
  ...[...'gbeng'].map((c) => 0xe0000 + c.charCodeAt(0)),
  0xe007f
);

/**
 * 월드컵 국가 코드(KOR, ENG 등)에 해당하는 국기 이모지를 반환함. 알 수 없는 코드는 🌍
 */
export function flagFor(code) {
  if (code === 'ENG') return ENGLAND_FLAG;
  const iso = ISO2_BY_CODE[code];
  if (!iso) return '🌍';
  return String.fromCodePoint(...[...iso].map((c) => REGIONAL_INDICATOR_BASE + c.charCodeAt(0) - 65));
}
