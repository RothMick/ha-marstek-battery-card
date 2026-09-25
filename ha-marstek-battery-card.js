// ha-marstek-battery-card v0.1.0
// Custom Lovelace card for Marstek batteries, built around the B2500 HMJ-2
// (hm2mqtt / ESPHome BLE bridge + AstraMeter).
// Standalone port of the former production button-card config (button-card-export.yaml):
// same rendering (font sizes, colors, spacing), no button-card dependency.
// User picks the SOC sensor; the other entities are derived from its
// hame_energy_hmj_2_<mac> prefix and can each be overridden individually
// (equivalent of the button-card variables: block).
// `model` swaps the B2500 icon for another Marstek device (Jupiter C, Venus D/E,
// the + / ++ variants with one or two extra packs); entities are then set by hand.

const SOC_SUFFIX = '_host_battery_soc';
const GREY = '#555';
const SOC_GREEN = '#65D173';

function resolveEntities(config) {
  const raw = config.entity.replace(/^sensor\./, '');
  const prefix = raw.replace(new RegExp(SOC_SUFFIX + '$'), '');
  // String.replace returns the input unchanged when the pattern does not match,
  // so a mismatched suffix silently produces prefixes like
  // "hame_energy_hmj_2_<mac>_battery_percentage" and, from those, entity IDs
  // that look plausible but never existed. Remember whether it actually matched.
  const suffixMatched = prefix !== raw;
  // AstraMeter entities drop the "hame_energy_" part of the prefix.
  const astraPrefix = prefix.replace(/^hame_energy_/, '');
  return {
    prefix,
    suffixMatched,
    input: config.input_entity || `sensor.${prefix}_total_input_power`,
    output: config.output_entity || `sensor.${prefix}_total_output_power`,
    soc: config.entity,
    weight: config.weight_entity || `number.astrameter_consumer_${astraPrefix}_distribution_weight`,
    temperature: config.temperature_entity || `sensor.${prefix}_temperature_max`,
    active: config.switch_entity || `switch.astrameter_consumer_${astraPrefix}_active`,
    // Connection entity for the badge, e.g. binary_sensor.*_ble_connected of an
    // ESPHome BLE bridge. Without it the badge falls back to checking whether
    // SOC and weight report a usable state.
    online: config.online_entity || null,
  };
}

// Config keys that would fall back to a derived entity ID. Only these make the
// derivation load-bearing — a card that overrides every one of them works fine
// with any SOC sensor name (that is how the ESPHome BLE bridge setup is wired).
function derivationDependencies(config) {
  const need = [];
  if (config.show_input !== false && !config.input_entity) need.push('input_entity');
  if (config.show_output !== false && !config.output_entity) need.push('output_entity');
  if (config.show_temperature !== false && !config.temperature_entity) need.push('temperature_entity');
  // weight feeds the value row and, without online_entity, the badge fallback
  if ((config.show_weight !== false || !config.online_entity) && !config.weight_entity) need.push('weight_entity');
  // active drives the SOC pulse and is always read
  if (!config.switch_entity) need.push('switch_entity');
  return need;
}

// Static SVG skeleton, built once. The fill rect (.soc-fill) is updated in
// place in _update() — rebuilding it would restart the pulse animation on
// every value update (visible flicker instead of a steady 3s pulse).
function batterySvg() {
  const sc = SOC_GREEN;
  const k = GREY;
  const fr = `<rect class='soc-fill' x='317' y='433' width='30' height='0' fill='${sc}' clip-path='url(#sclip)'/>`;
  return `<svg viewBox='0 0 960 960' width='68' height='68' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M463.821 33c31.065 0 60.98 34.899 60.98 70.568L524.8 847c0 53.691-41.036 73.634-65.581 72.485' stroke='${k}' stroke-width='20'/><path d='M701.561 41C732.351 41 762 72.41 762 104.512V790.72c0 48.323-40.673 66.272-65 65.238' stroke='${k}' stroke-width='10'/><path d='M446.201 71c-25.368 0-214.924.994-239.312.994-24.388 0-32.178 26.302-31.881 42.083.298 15.781 2.677 662.521 2.677 702.626 0 40.105 23.248 47.135 46.396 49.033l211.363 13.069c20.045 1.037 53.556-.468 53.556-46.141V113.356C489 81.16 471.569 71 446.201 71Z' stroke='${k}' stroke-width='20'/><ellipse cx='789.809' cy='569.104' rx='11.889' ry='26.463' fill='${k}'/><path d='M207 114a5 5 0 0 1 5 5v711a5 5 0 0 1-10 0V119a5 5 0 0 1 5-5Zm25-2a5 5 0 0 1 5 5v713a5 5 0 0 1-10 0V117a5 5 0 0 1 5-5Zm25 0a5 5 0 0 1 5 5v713a5 5 0 0 1-10 0V117a5 5 0 0 1 5-5Zm30 573.834V830a5 5 0 0 1-10 0V685.235l10 .599Zm25 1.496V830a5 5 0 0 1-10 0V686.731l10 .599Zm25 1.496V830a5 5 0 0 1-10 0V688.228l10 .598Zm25 1.496V830a5 5 0 0 1-10 0V689.724l10 .598Zm25 1.496V830a5 5 0 0 1-10 0V691.221l10 .597ZM407 108a5 5 0 0 1 5 5v717a5 5 0 0 1-10 0V113a5 5 0 0 1 5-5Zm25 0a5 5 0 0 1 5 5v717a5 5 0 0 1-10 0V113a5 5 0 0 1 5-5Zm25-1a5 5 0 0 1 5 5v718a5 5 0 0 1-10 0V112a5 5 0 0 1 5-5Zm-75 3a5 5 0 0 1 5 5v526.432l-10-.599V115a5 5 0 0 1 5-5Zm-25 1a5 5 0 0 1 5 5v523.936l-10-.599V116a5 5 0 0 1 5-5Zm-25 342a5 5 0 0 1 5 5v180.439l-10-.598V458a5 5 0 0 1 5-5Zm-25-346a5 5 0 0 1 5 5v524.943l-10-.598V112a5 5 0 0 1 5-5Zm-25 2a5 5 0 0 1 5 5v521.447l-10-.598V114a5 5 0 0 1 5-5Z' fill='${k}'/><path d='m175 104 313-2v20l-313 2v-20Z' fill='${k}'/><path d='M449.247 928.327v7.804l15.724 2.301h11.889l10.355-2.301v-7.804l-4.602.519h-23.395c-2.039-.096-5.439-.273-9.971-.519-32.295-1.755-122.083-6.995-186.774-10.867m0 0c-14.646-.877-28.005-1.684-39.119-2.364-15.833-.969-35.4-2.802-39.354-3.096-20.71-1.535-51.541-23.809-51.541-70.597s-3.451-718.029-3.451-752.466c0-34.436 30.992-63.664 65.94-63.664 34.949 0 237.808-1.918 268.873-1.918 0 0 256.574 2.684 301.062 3.834 44.489 1.15 67.116 44.488 67.116 71.718 0 27.23-1.534 646.998-1.534 680.365 0 33.366-22.628 60.212-49.09 67.499-26.463 7.287-92.045 25.286-92.045 25.286l-22.628 6.216-184.089 50.573m-259.259-13.75v9.845l6.519 1.534h10.355l16.875-.767 5.37-.767v-7.481' stroke='${k}' stroke-width='40'/><path d='m180 814 303 19v20l-303-19v-20Z' fill='${k}'/><clipPath id='sclip'><rect x='317' y='224' width='30' height='209' rx='8'/></clipPath><rect x='317' y='224' width='30' height='209' rx='8' fill='${k}'/>${fr}</svg>`;
}

// Other Marstek devices, from RothMick/icons4homey (commit 9e1be16), black
// recoloured to the card's grey. `soc` holds the attributes of the icon's green
// stroke, which is drawn twice: as a grey track and as the pulsing fill whose
// length follows the SOC (pathLength 100 -> stroke-dasharray "<soc> 100").
const MODEL_ICONS = {
  'jupiter_c': {
    label: 'Jupiter C',
    body: `<path d='m103.498 879.173-18.157-1.085s-5.341 0-5.341-14.105V557.62c0-10.307 4.806-21.157 14.953-22.68 10.147-1.522 134.58-14.682 134.58-14.682C240.97 518.811 259.052 517 270.12 517c20.294 0 570.929 10.325 582.644 10.783 13.885.542 27.236 5.425 27.236 22.242v284.121c0 14.647-3.204 20.615-10.147 22.785-6.942 2.17-20.293 6.51-20.293 6.51l-3.739 34.72-5.874-34.72H815.38l-43.257 14.647v9.223s-5.77 10.85-11.749 12.477c-5.979 1.628-34.179 7.053-34.179 7.053l-8.545 42.857-6.408-42.857-592.257-27.125-8.01 40.145-7.477-40.688Z' stroke='${GREY}' stroke-width='40'/><path stroke='${GREY}' stroke-width='20' d='m334.421 845.008 111.136 4.41M741.179 552.869l136.562-26.672M736.498 555.283 80.36 542.481M740.056 538.656v358.986'/><path d='M779.448 552.768v30.872m62.183-8.38 29.989 38.81s-71.003 12.789-81.503 14.553c-7.468-1.6-10.669-5.334-10.669-10.669V583.64m62.183-8.38v-36.604m0 36.604-62.183 8.38' stroke='${GREY}' stroke-width='10'/><path d='M438.703 598.252a5 5 0 0 1 4.918 4.999v179.606a5 5 0 0 1-5.109 4.999l-97.833-2.14a5.001 5.001 0 0 1-4.891-4.999V601.65a5 5 0 0 1 5.082-4.999l97.833 1.601Zm-83.747 20.423a5 5 0 0 0-5.056 4.999v135.538a5.002 5.002 0 0 0 4.946 5l69.824.767a5 5 0 0 0 5.055-4.999V624.445a5 5 0 0 0-4.945-4.999l-69.824-.771Z' fill='${GREY}'/>`,
    soc: "stroke-width='20' stroke-linecap='round' d='m367.975 743.706 44.39.608'",
  },
  'jupiter_c+': {
    label: 'Jupiter C + 1 extension pack',
    body: `<path d='M439.612 359a5 5 0 0 1 5 5.026l-.965 181.365a5 5 0 0 1-5.038 4.973l-97.859-.736a5 5 0 0 1-4.962-5V364.002a5 5 0 0 1 5-5l98.824-.002Zm-84.947 22.932a5 5 0 0 0-5 5V522.47a5 5 0 0 0 5 5h70.06a5.001 5.001 0 0 0 5-5V386.935a5 5 0 0 0-5-5l-70.06-.003Z' fill='${GREY}'/><path d='m103.498 879.539-18.157-1.085s-5.34 0-5.34-14.105L80 300.42c0-10.308 4.806-21.158 14.953-22.68 10.147-1.523 612.582-3.329 616.124-3.329l40.588-.001c4.851.002 89.384 1.92 101.099 2.378 13.885.542 27.236 5.425 27.236 22.242v535.481c0 14.648-3.204 20.615-10.147 22.785-6.942 2.17-20.293 6.51-20.293 6.51l-3.739 34.72-5.874-34.72h-24.566l-43.258 14.648v9.222s-5.77 10.85-11.749 12.478c-5.979 1.627-34.179 7.052-34.179 7.052l-8.545 42.857-6.408-42.857-592.256-27.125-8.011 40.145-7.477-40.687Z' stroke='${GREY}' stroke-width='40'/><path stroke='${GREY}' stroke-width='20' d='M740.055 280.588v617.419M334.421 844.5l111.135 4.41M336 608.996l109.556 2.408M741.551 650.194l136.905-21.381M736.498 651.791 80.361 638.988'/><path d='M779.448 646.629v48.511m55.568-7.938 32.194 35.722s-66.593 11.908-77.093 13.672c-7.468-1.601-10.669-5.335-10.669-10.669V695.14m55.568-7.938v-48.07m0 48.07-55.568 7.938M780.33 284.114v41.896m62.183-3.087 26.902 36.163s-73.649 2.646-78.416 2.646c-7.468-1.6-10.669-5.334-10.669-10.668V326.01m62.183-3.087v-52.921m0 52.921-62.183 3.087' stroke='${GREY}' stroke-width='10'/>`,
    soc: "stroke-width='20' stroke-linecap='round' d='m367.975 506.14 44.39.608'",
  },
  'jupiter_c++': {
    label: 'Jupiter C + 2 extension packs',
    body: `<path d='m103.498 877.85-18.157-1.111s-5.34 0-5.34-14.446L80 59.98c0-10.557 4.806-21.67 14.953-23.229 10.147-1.56 612.582-2.715 616.124-2.715h40.588c4.851.001 89.384 4.947 101.099 5.416 13.885.555 27.236 5.556 27.236 22.78v769.502c0 15.002-3.204 21.113-10.147 23.336-6.942 2.222-20.293 6.667-20.293 6.667l-3.739 35.56-5.874-35.56h-24.566l-43.258 15.002v9.446s-5.77 11.112-11.749 12.779c-5.979 1.667-34.179 7.223-34.179 7.223l-8.545 43.893-6.408-43.893-592.256-27.781-8.011 41.116-7.477-41.672Z' stroke='${GREY}' stroke-width='40'/><path transform='rotate(2.328 -20889.559 8649.797) skewX(.109)' stroke='${GREY}' stroke-width='20' d='M0-10h111.227'/><path transform='rotate(1.396 -24880.408 14004.868) skewX(.065)' stroke='${GREY}' stroke-width='20' d='M0-10h111.168'/><path stroke='${GREY}' stroke-width='20' d='M334 363h111'/><path transform='matrix(.98745 -.15794 .15074 .98857 743.094 653.074)' stroke='${GREY}' stroke-width='20' d='M0-10h138.646'/><path transform='rotate(-2.969 8260.62 -14087.33) skewX(-.138)' stroke='${GREY}' stroke-width='20' d='M0-10h139.548'/><path transform='rotate(-178.854 371.515 313.495) skewX(.053)' stroke='${GREY}' stroke-width='20' d='M0-10h656.268'/><path transform='matrix(-1 -.00412 .00393 -1 737.11 390.828)' stroke='${GREY}' stroke-width='20' d='M0-10h657.116'/><path stroke='${GREY}' stroke-width='20' d='M740.055 34v862.709'/><path d='M779.448 639.304v49.685m55.568-8.13 32.194 36.586s-66.593 12.196-77.093 14.002c-7.468-1.639-10.669-5.463-10.669-10.927v-31.531m55.568-8.13v-49.233m0 49.233-55.568 8.13M779.448 394.473v58.686m56.45-1.355 37.927 37.941s-64.388 3.162-85.557 4.066c-6.615-1.807-8.82-4.517-8.82-12.196v-28.456m56.45-1.355-.882-65.01m.882 65.01-56.45 1.355M777.685 48.453v39.748m63.506 1.355 28.224 35.804s-76.38 2.589-81.146 2.589c-7.468-1.639-10.584-5.463-10.584-10.927v-28.82m63.506 1.354V49.81m0 39.747-63.506-1.355' stroke='${GREY}' stroke-width='10'/><path d='M440.1 108.852a4.516 4.516 0 0 1 4.516 4.54l-.97 186.962a4.518 4.518 0 0 1-4.552 4.494l-98.823-.762a4.518 4.518 0 0 1-4.482-4.517V113.37a4.516 4.516 0 0 1 4.517-4.516l99.794-.002Zm-85.917 23.484a4.517 4.517 0 0 0-4.517 4.517v140.024a4.519 4.519 0 0 0 4.517 4.518h71.025a4.518 4.518 0 0 0 4.518-4.518V136.856a4.517 4.517 0 0 0-4.517-4.516l-71.026-.004Z' fill='${GREY}'/>`,
    soc: "transform='rotate(.802 -19042.185 25640.843) skewX(.038)' stroke-width='18.067' stroke-linecap='round' d='M9.034-9.034h46.327'",
  },
  'venus_d': {
    label: 'Venus D',
    body: `<path d='m103.199 880.392-17.927-1.071s-5.272 0-5.272-13.925V610.457c0-10.176 4.745-20.888 14.763-22.391 10.017-1.504 132.865-18.849 132.865-18.849 15.289-1.61 20.035-3.217 40.07-3.217s563.654 14.548 575.219 14.999c13.709.536 26.89 5.356 26.89 21.959v232.981c0 14.46-3.164 20.352-10.018 22.494-6.854 2.143-20.035 6.427-20.035 6.427l-3.691 34.278-5.799-34.278H806.01l-42.706 14.461v9.105s-5.696 10.712-11.599 12.318c-5.903 1.607-33.744 6.963-33.744 6.963l-8.436 42.311-6.327-42.311-584.709-26.779-7.909 39.633-7.381-40.169Z' stroke='${GREY}' stroke-width='40'/><path d='M727.869 609.539v299.552M80.873 698.894 728.65 719.96M325.374 845.011l136.929 6.319M725.964 720.236l151.675-36.865M732.73 618.014l134.822-26.333M728.131 620.061l-647.778-12.64' stroke='${GREY}' stroke-width='20'/><path d='m770.978 636.166-10 1.953v-20.823h10v18.87Zm13.692-2.674-10 1.953V615.19h10v18.302Zm13.693-2.675-10 1.954v-19.688h10v17.734Zm13.693-2.673-10 1.953v-19.119h10v17.166Zm13.693-2.675-10 1.953v-19.605h10v17.652Zm13.692-2.674-10 1.953v-20.09h10v18.137Zm13.694-2.675-10 1.953v-20.575h10v18.622ZM646.441 655.735l-.273 9.996-32.651-.892v-10.003l32.924.899Zm-56.097-1.532v10.003l-34.759-.949v-10.003l34.759.949Zm-57.931-1.582v10.003l-282.283-7.709v-10.004l282.283 7.71Zm-305.456-8.343v10.004l-30.546-.835v-10.003l30.546.834Zm-53.719-1.466v10.002l-29.492-.804.274-9.996 29.218.798Z' fill='${GREY}'/>`,
    soc: "stroke-width='20' stroke-linecap='round' d='m255.715 649.446 270.852 7.277'",
  },
  'venus_d+': {
    label: 'Venus D + 1 extension pack',
    body: `<path d='m103.19 879.985-17.918-1.07s-5.27 0-5.27-13.912V428.23c0-10.167 4.743-20.869 14.756-22.37 10.013-1.502 144.608-10.273 144.608-10.273 15.283-1.609 20.774-1.919 40.801-1.919 20.026 0 550.857 4.68 562.417 5.132 13.703.535 26.878 5.351 26.878 21.939v414.834c0 14.447-3.162 20.333-10.013 22.474-6.852 2.14-20.027 6.421-20.027 6.421l-3.689 34.245-5.797-34.245h-24.242l-42.688 14.447v9.097s-5.694 10.701-11.594 12.307c-5.901 1.605-33.729 6.956-33.729 6.956l-8.432 42.272-6.324-42.272-584.453-26.755-7.905 39.597-7.379-40.132Z' stroke='${GREY}' stroke-width='40'/><path stroke='${GREY}' stroke-width='20' d='M728.719 407.559v494.076M80.327 698.634l648.221 21.081M324.996 845.255l137.023 6.324M324.844 672.003l137.022 4.216M725.851 719.994l151.779-36.891M734.537 418.445l143.259-13.37M728.063 423.807l-648.222-9.736M728.018 517.84 79.796 505.192'/><path d='M772.482 705.246v-35.31c0-5.27 1.054-9.261 10.014-10.843 8.959-1.581 70.619-14.23 70.619-14.23' stroke='${GREY}' stroke-width='10'/><path d='m770.89 443.703-10 1.016v-23.31h10v22.294Zm13.702-1.391-10 1.015v-25.08h10v24.065Zm13.702-1.392-10 1.016v-25.797h10v24.781Zm13.703-1.392-10 1.016v-28.621h10v27.605Zm13.702-1.391-10 1.015v-31.445h10v30.43Zm13.972-1.419-10 1.015v-34.244h10v33.229Zm13.702-1.392-10 1.016v-37.069h10v36.053ZM651.708 452.546l-.126 9.999-32.683-.411-.148-10.003 32.957.415Zm-56.152-.705.148 10.001-34.794-.437-.147-10.002 34.793.438Zm-57.989-.73.148 10.003-282.559-3.549-.147-10.003 282.558 3.549Zm-305.754-3.84.148 10.002-30.576-.384-.148-10.002 30.576.384Zm-53.771-.675.147 10.002-29.52-.371.126-9.999 29.247.368Z' fill='${GREY}'/>`,
    soc: "stroke-width='20' stroke-linecap='round' d='m260.941 451.733 271.045 4.057'",
  },
  'venus_d++': {
    label: 'Venus D + 2 extension packs',
    body: `<path d='M107.332 880.614 89.51 879.55s-5.242 0-5.242-13.838V229.644c0-10.112 4.717-20.757 14.677-22.251 9.96-1.493 599.682-6.055 599.682-6.055l144.155 7.41c17.298 1.813 26.734 5.322 26.734 21.821v605.87c0 14.37-3.145 20.225-9.96 22.354-6.814 2.129-19.919 6.387-19.919 6.387l-3.67 34.062-5.766-34.062h-24.113l-42.46 14.37v9.048s-5.663 10.644-11.532 12.241c-5.869 1.597-33.549 6.919-33.549 6.919l-8.387 42.047-6.291-42.047-581.335-26.611-7.863 39.385-7.339-39.918Z' stroke='${GREY}' stroke-width='40'/><path stroke='${GREY}' stroke-width='20' d='M729.652 194v708.992M84.593 700.179l644.763 20.968M327.957 845.011l136.292 6.29M327.804 672.005l136.291 4.193M327.573 482l136.291 1.049M726.669 721.424l150.969-36.694M735.32 522.873l142.495-13.299M733.748 323.859h137.34M728.836 523.92 84.073 511.339M728.826 325.368H80'/><path d='m853.549 246.52-10-.326v-29.126h10v29.452Zm-13.63-.444-10-.325v-24.49h10v24.815Zm-13.871-.451-10-.325v-19.844h10v20.169Zm-13.629-.443-10-.326v-26.739h10v27.065Zm-13.63-.443-10-.325v-27.346h10v27.671Zm-13.629-.443-10-.325v-24.806h10v25.131Zm-13.629-.443-10-.326v-21.216h10v21.542ZM652.833 257.282l.089 10-32.51.29-.362-9.997 32.783-.293Zm-55.855.499.362 9.997-34.609.309-.362-9.997 34.609-.309Zm-57.682.515.363 9.997-281.064 2.511-.363-9.997 281.064-2.511Zm-304.136 2.717.363 9.998-30.414.272-.362-9.998 30.413-.272Zm-53.486.48.362 9.995-29.364.263-.09-9.999 29.092-.259Z' fill='${GREY}'/><path d='M776.209 706.14v-35.121c0-5.242 3.145-8.911 10.484-10.484 7.339-1.573 72.863-14.678 72.863-14.678M777.257 511.966v-35.121c0-5.242 2.621-10.786 9.96-10.785 7.338.001 72.339-5.767 72.339-5.767' stroke='${GREY}' stroke-width='10'/>`,
    soc: "stroke-width='20' stroke-linecap='round' d='m266.753 264.547 264.291-1.612'",
  },
  'venus_e': {
    label: 'Venus E',
    body: `<path d='m173.066 881.677-14.732-1.05s-4.334 0-4.334-13.648V95.305c0-9.974 13.703-31.18 33.072-32.597C206.441 61.291 605.638 32.001 620.283 32c14.645 0 34.014 1.89 50.075 3.31 26.93 4.248 77.951 13.225 112.069 19.366C795.079 56.953 805 69.32 805 87.93c0 16.273-1.892 738.575-1.892 750.175 0 14.174-2.6 19.948-8.233 22.048-5.633 2.1-16.466 6.3-16.466 6.3l-3.033 33.596-4.767-33.596h-19.932l-35.099 14.173v8.924s-4.681 10.499-9.533 12.074c-4.851 1.575-27.732 6.824-27.732 6.824l-6.933 41.471-5.2-41.471-480.548-26.247-6.499 38.846-6.067-39.371Z' stroke='${GREY}' stroke-width='40'/><path stroke='${GREY}' stroke-width='20' d='m690.927 273.01-522.498 13.252M697.319 899.569V90.109s0-21.26-13.259-33.07c-13.259-11.81-35.904-16.062-35.904-16.062M344.401 824.656l136.058 6.614'/><path d='m584.671 138.592.598 9.982-21.954.903-.793-9.974 22.149-.911Zm-37.728 1.552.792 9.974-23.369.962-.793-9.975 23.37-.961Zm-38.95 1.603.793 9.974-189.791 7.808-.793-9.974 189.791-7.808Zm-205.37 8.449.792 9.974-20.536.846-.793-9.975 20.537-.845Zm-36.117 1.487.792 9.973-19.828.816-.598-9.982 19.634-.807ZM719.719 139.314c0-8.675 7.338-15.542 15.994-14.967l24.049 1.597c7.882.523 14.007 7.068 14.007 14.967V214.4c0 8.414-6.92 15.182-15.332 14.996l-24.05-.532c-8.153-.181-14.668-6.842-14.668-14.996v-74.554ZM719.719 263.454c0-6.724 4.916-12.124 10.875-11.949l32.854.969c5.743.169 10.321 5.469 10.321 11.949v43.178c0 6.815-4.284 10.556-10.321 10.245l-33.793-.684c-5.659-.292-9.936-4.868-9.936-11.257v-42.451Z' fill='${GREY}'/>`,
    soc: "stroke-width='20' stroke-linecap='round' d='m325.178 153.428 176.543-6.79'",
  },
};

const MODELS = ['b2500', ...Object.keys(MODEL_ICONS)];

function modelSvg(model) {
  const { body, soc } = MODEL_ICONS[model];
  return `<svg viewBox='0 0 960 960' width='68' height='68' fill='none' xmlns='http://www.w3.org/2000/svg'>${body}<path ${soc} stroke='${GREY}'/><path class='soc-fill' pathLength='100' stroke-dasharray='0 100' ${soc} stroke='${SOC_GREEN}'/></svg>`;
}

function valueIcon(key, soc) {
  if (key === 'input') return 'mdi:solar-power';
  if (key === 'output') return 'mdi:transmission-tower';
  if (key === 'weight') return 'mdi:scale-balance';
  if (key === 'temperature') return 'mdi:thermometer';
  // soc
  if (isNaN(soc)) return 'mdi:battery-unknown';
  if (soc < 10) return 'mdi:battery-outline';
  const lvl = Math.round(soc / 10) * 10;
  return lvl >= 100 ? 'mdi:battery' : `mdi:battery-${lvl}`;
}

class HaMarstekBatteryCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error('"entity" (SOC sensor) is required');
    this._config = {
      show_input: true,
      show_output: true,
      show_soc: true,
      show_weight: true,
      show_temperature: true,
      ...config,
    };
    this._model = this._config.model || 'b2500';
    if (!MODELS.includes(this._model)) {
      throw new Error(`"model" must be one of: ${MODELS.join(', ')}. Got "${this._config.model}".`);
    }
    this._entities = resolveEntities(this._config);
    // Fail loudly instead of rendering empty fields: if the SOC sensor does not
    // carry the expected suffix, every non-overridden entity ID is wrong.
    if (!this._entities.suffixMatched) {
      const need = derivationDependencies(this._config);
      if (need.length) {
        throw new Error(
          `"entity" must end in "${SOC_SUFFIX}", otherwise the other entities cannot be derived ` +
            `from it. Got "${this._config.entity}". Either pick a SOC sensor with this suffix ` +
            `(e.g. sensor.hame_energy_hmj_2_<mac>${SOC_SUFFIX}) or set these keys individually: ` +
            `${need.join(', ')}.`
        );
      }
    }
    this._built = false;
  }

  set hass(hass) {
    const prev = this._hass;
    this._hass = hass;
    if (!this._entities) return; // hass can arrive before setConfig
    if (!this._built) {
      this._build();
      this._update();
      return;
    }
    // hass fires for every state change in HA; repaint only when one of the
    // card's own entities changed (equivalent of button-card's triggers_update)
    if (this._hasRelevantChange(prev, hass)) this._update();
  }

  _hasRelevantChange(prev, hass) {
    if (!prev) return true;
    // formatEntityState also depends on the entity registry (display precision)
    // and the user's locale
    if (prev.entities !== hass.entities || prev.locale !== hass.locale) return true;
    const e = this._entities;
    // online must be in this list: when a BLE bridge loses the link, all value
    // sensors freeze, so the connection entity is the only state that changes.
    return [e.input, e.output, e.soc, e.weight, e.temperature, e.active, e.online]
      .filter(Boolean)
      .some((id) => prev.states[id] !== hass.states[id]);
  }

  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        @keyframes b2pulse { 0%,100% { opacity:0.25; } 50% { opacity:1; } }
        .soc-fill { display: none; }
        .soc-fill.alive { display: inline; animation: b2pulse 3s ease-in-out infinite; }
        /* font-size 1.2rem + line-height normal = button-card's ha-card base,
           so the 1.05em/0.82em values resolve to identical pixel sizes */
        ha-card { position: relative; box-sizing: border-box; padding: 10px 14px 14px 14px; font-size: 1.2rem; line-height: normal; cursor: default; -webkit-user-select: none; user-select: none; }
        .row { display: grid; grid-template-columns: min-content 1fr; align-items: start; }
        .icon-wrap { padding-right: 8px; align-self: center; }
        .body { margin-left: 10px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-top: 6px; }
        .title { font-weight: 700; font-size: 1.05em; color: var(--primary-text-color); white-space: nowrap; }
        .vals { display: flex; flex-wrap: wrap; gap: 4px 14px; }
        .val { display: flex; align-items: center; gap: 3px; cursor: pointer; }
        .val ha-icon { --mdc-icon-size: 16px; }
        .val span { font-size: 0.82em; font-weight: 600; }
        .badge { position: absolute; top: 6px; right: 10px; padding: 1px 9px; border-radius: 11px; background: #12361f; color: #22c55e; font-size: 0.82em; font-weight: 600; line-height: 1.5; display: none; pointer-events: none; z-index: 3; }
        .badge.online { display: inline-block; }
      </style>
      <ha-card>
        <div class="badge"></div>
        <div class="row">
          <div class="icon-wrap"></div>
          <div class="body">
            <div class="title"></div>
            <div class="vals"></div>
          </div>
        </div>
      </ha-card>
    `;
    this.shadowRoot.querySelector('.icon-wrap').innerHTML = this._model === 'b2500' ? batterySvg() : modelSvg(this._model);
    const vals = this.shadowRoot.querySelector('.vals');
    vals.addEventListener('click', (ev) => {
      const target = ev.target.closest('[data-entity]');
      if (!target) return;
      ev.stopPropagation();
      // Fired from the card itself, like HA's own fireEvent(): bubbles through
      // shadow roots to whichever host handles it, including browser_mod popups.
      this.dispatchEvent(
        new CustomEvent('hass-more-info', {
          bubbles: true,
          composed: true,
          detail: { entityId: target.dataset.entity },
        })
      );
    });

    // Value rows are built once (they only change via setConfig -> rebuild);
    // _update() then only touches text, colors and the battery icon in place.
    const e = this._entities;
    const defs = [
      ['input', e.input, this._config.show_input],
      ['output', e.output, this._config.show_output],
      ['temperature', e.temperature, this._config.show_temperature],
      ['weight', e.weight, this._config.show_weight],
      ['soc', e.soc, this._config.show_soc],
    ];
    this._rows = [];
    defs
      .filter((d) => d[2])
      .forEach(([key, entityId]) => {
        const row = document.createElement('div');
        row.className = 'val';
        row.dataset.entity = entityId;
        const icon = document.createElement('ha-icon');
        const span = document.createElement('span');
        row.append(icon, span);
        vals.appendChild(row);
        this._rows.push({ key, entityId, icon, span });
      });

    this._els = {
      fill: this.shadowRoot.querySelector('.soc-fill'),
      title: this.shadowRoot.querySelector('.title'),
      badge: this.shadowRoot.querySelector('.badge'),
    };
    this._built = true;
  }

  _update() {
    const hass = this._hass;
    const e = this._entities;
    const g = (id) => (hass.states[id] ? hass.states[id].state : '–');
    // Display text as HA shows it everywhere else: display precision (incl. the
    // integration's suggested one — ESPHome reports "105.0" with precision 0),
    // locale decimal separator, unit from the entity, translated "unavailable".
    const fmt = (id) => {
      const st = hass.states[id];
      if (!st) return '–';
      if (hass.formatEntityState) return hass.formatEntityState(st);
      const unit = st.attributes.unit_of_measurement;
      return unit ? `${st.state} ${unit}` : st.state;
    };
    const ok = (id) => hass.states[id] && hass.states[id].state !== 'unavailable' && hass.states[id].state !== 'unknown';

    const soc = Number(g(e.soc));
    const on = hass.states[e.active] && hass.states[e.active].state === 'on';
    const alive = on && soc > 0;
    const grey = '#9e9e9e';
    const ic = alive ? 'var(--secondary-text-color)' : grey;
    const vc = alive ? 'var(--primary-text-color)' : grey;
    const socColor = alive ? (soc < 20 ? '#EA3424' : soc < 80 ? '#F4BA40' : '#65D173') : grey;

    const friendly = hass.states[e.soc]?.attributes?.friendly_name || e.prefix;
    const title = this._config.name || friendly.replace(/\s*host battery soc$/i, '');

    const els = this._els;
    // SVG fill + pulse depend only on SOC > 0, not on the active switch
    // (button-card pic template); the switch only greys out the value row.
    // Attribute/class updates keep the pulse animation running uninterrupted.
    const safeSoc = Math.min(Math.max(isNaN(soc) ? 0 : soc, 0), 100);
    if (this._model === 'b2500') {
      const fh = (209 * safeSoc) / 100;
      els.fill.setAttribute('y', String(433 - fh));
      els.fill.setAttribute('height', String(fh));
    } else {
      els.fill.setAttribute('stroke-dasharray', `${safeSoc} 100`);
    }
    els.fill.classList.toggle('alive', soc > 0);
    els.title.textContent = title;

    for (const row of this._rows) {
      const isSoc = row.key === 'soc';
      const iconName = valueIcon(row.key, soc);
      if (row.icon.getAttribute('icon') !== iconName) row.icon.setAttribute('icon', iconName);
      row.icon.style.color = isSoc ? socColor : ic;
      row.span.style.color = isSoc ? socColor : vc;
      row.span.textContent = fmt(row.entityId);
    }

    // With a dedicated connection entity the badge mirrors it directly ('off'
    // = link down). Otherwise fall back to "both values report a usable state".
    const conn = e.online && hass.states[e.online];
    const online = e.online
      ? !!conn && conn.state !== 'off' && conn.state !== 'unavailable' && conn.state !== 'unknown'
      : ok(e.soc) && ok(e.weight);
    els.badge.textContent = online ? 'Online' : '';
    els.badge.classList.toggle('online', online);
  }

  getCardSize() {
    return 2;
  }

  static getConfigElement() {
    return document.createElement('ha-marstek-battery-card-editor');
  }

  static getStubConfig(hass) {
    // Pre-pick the first SOC sensor so the preview works right away instead
    // of showing a "entity required" error card.
    const entity =
      Object.keys(hass?.states || {}).find((id) => id.startsWith('sensor.') && id.endsWith(SOC_SUFFIX)) || '';
    return {
      entity,
      show_input: true,
      show_output: true,
      show_soc: true,
      show_weight: true,
      show_temperature: true,
    };
  }
}

const VALUE_TOGGLES = [
  ['show_input', 'Solar input'],
  ['show_output', 'Output'],
  ['show_temperature', 'Cell temperature (max)'],
  ['show_weight', 'Distribution weight'],
  ['show_soc', 'SOC'],
];

class HaMarstekBatteryCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = {
      show_input: true,
      show_output: true,
      show_soc: true,
      show_weight: true,
      show_temperature: true,
      ...config,
    };
    // config-changed -> HA calls setConfig again on every keystroke; rebuilding
    // the DOM here would destroy the focused input. Render once, then only sync.
    if (this._form) {
      this._sync();
    } else {
      this._render();
    }
  }

  _sync() {
    this._form.data = this._formData();
    if (this._optForm) this._optForm.data = this._config;
    this.shadowRoot.querySelectorAll('ha-switch[data-option]').forEach((sw) => {
      sw.checked = this._config[sw.dataset.option] !== false;
    });
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    if (this._optForm) this._optForm.hass = hass;
  }

  // The model select shows B2500 when the key is absent (the default).
  _formData() {
    return { model: 'b2500', ...this._config };
  }

  _schema() {
    return [
      { name: 'name', selector: { text: {} } },
      { name: 'entity', selector: { entity: { domain: 'sensor' } } },
      {
        name: 'model',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'b2500', label: 'B2500' },
              ...Object.entries(MODEL_ICONS).map(([value, { label }]) => ({ value, label })),
            ],
          },
        },
      },
    ];
  }

  _optionalSchema() {
    return [
      { name: 'input_entity', selector: { entity: { domain: 'sensor' } } },
      { name: 'output_entity', selector: { entity: { domain: 'sensor' } } },
      { name: 'temperature_entity', selector: { entity: { domain: 'sensor' } } },
      { name: 'weight_entity', selector: { entity: { domain: 'number' } } },
      { name: 'switch_entity', selector: { entity: { domain: 'switch' } } },
      { name: 'online_entity', selector: { entity: { filter: { domain: ['binary_sensor', 'sensor'] } } } },
    ];
  }

  _toggleOption(key, checked) {
    this._config = { ...this._config, [key]: checked };
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config } }));
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML =
      '<style>' +
      ':host{display:block}' +
      '.editor{display:flex;flex-direction:column;gap:16px;padding:4px 0}' +
      '.options{display:flex;flex-direction:column;gap:10px}' +
      '.options-title{font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--secondary-text-color)}' +
      '.opt-row{display:flex;align-items:center;gap:12px}' +
      '.opt-label{font-size:14px;color:var(--primary-text-color)}' +
      'ha-expansion-panel{--expansion-panel-content-padding:0}' +
      '.opt-body{padding:12px}' +
      '</style>' +
      '<div class="editor">' +
      '<ha-form class="main-form"></ha-form>' +
      '<ha-expansion-panel outlined header="Optional entities">' +
      '<div class="opt-body"><ha-form class="opt-form"></ha-form></div>' +
      '</ha-expansion-panel>' +
      '<div class="options">' +
      '<div class="options-title">Display</div>' +
      VALUE_TOGGLES.map(
        ([key, label]) =>
          '<div class="opt-row"><ha-switch data-option="' +
          key +
          '"' +
          (this._config[key] !== false ? ' checked' : '') +
          '></ha-switch><span class="opt-label">' +
          label +
          '</span></div>'
      ).join('') +
      '</div>' +
      '</div>';

    const labels = {
      entity: 'SOC sensor (sensor.*_host_battery_soc)',
      name: 'Tile title',
      model: 'Device (icon)',
      input_entity: 'Input sensor (derived if empty)',
      output_entity: 'Output sensor (derived if empty)',
      temperature_entity: 'Temperature sensor (derived if empty)',
      weight_entity: 'Distribution weight (derived if empty)',
      switch_entity: 'Active switch (derived if empty)',
      online_entity: 'Online badge: connection entity (e.g. *_ble_connected)',
    };
    const computeLabel = (s) => labels[s.name] || s.name;
    const onChange = (ev) => {
      const cfg = { ...this._config, ...ev.detail.value };
      // cleared fields fall back to their default (derivation / friendly name)
      // — drop the empty keys instead of leaving '' in the YAML
      ['name', 'input_entity', 'output_entity', 'temperature_entity', 'weight_entity', 'switch_entity', 'online_entity'].forEach((k) => {
        if (!cfg[k]) delete cfg[k];
      });
      // b2500 is the default — keep it out of the YAML like the other defaults
      if (cfg.model === 'b2500') delete cfg.model;
      this._config = cfg;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config } }));
    };

    const form = this.shadowRoot.querySelector('ha-form.main-form');
    form.hass = this._hass;
    form.schema = this._schema();
    form.data = this._formData();
    form.computeLabel = computeLabel;
    form.addEventListener('value-changed', onChange);
    this._form = form;

    const optForm = this.shadowRoot.querySelector('ha-form.opt-form');
    optForm.hass = this._hass;
    optForm.schema = this._optionalSchema();
    optForm.data = this._config;
    optForm.computeLabel = computeLabel;
    optForm.addEventListener('value-changed', onChange);
    this._optForm = optForm;

    const panel = this.shadowRoot.querySelector('ha-expansion-panel');
    panel.header = 'Optional entities';
    panel.leftChevron = true; // must be set as JS property, not attribute

    this.shadowRoot.querySelectorAll('ha-switch[data-option]').forEach((sw) => {
      sw.addEventListener('change', () => this._toggleOption(sw.dataset.option, sw.checked));
    });
  }
}

customElements.define('ha-marstek-battery-card', HaMarstekBatteryCard);
customElements.define('ha-marstek-battery-card-editor', HaMarstekBatteryCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ha-marstek-battery-card',
  name: 'Marstek Battery Card',
  description: 'Marstek battery values: solar input, output, SOC, distribution weight, cell temperature',
});

console.info('%c HA-MARSTEK-BATTERY-CARD %c v0.1.0 ', 'color:white;background:#65D173;font-weight:700;', 'color:#65D173;background:white;font-weight:700;');
