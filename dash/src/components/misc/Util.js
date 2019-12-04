import * as d3 from 'd3/dist/d3.min'

// Utility functions and data.
const Util = {}

// List of countries that report data yearly only.
Util.yearlyReportIso2 = ['VE']

// Returns cross-browser compatible date object from input date string.
Util.getDateObject = str => {
  return new Date(str.replace(/-/g, '/'))
}

// Calculate age difference in months from text datetime strings.
// Assumes a is more recent than b
Util.getMonthsDiff = (aStr, bStr) => {
  const aDt = new Date(aStr.replace(/-/g, '/'))
  const bDt = new Date(bStr.replace(/-/g, '/'))

  // count months
  let monthsDiff = 0
  let stop = false
  while (!stop) {
    // get years
    const aYear = aDt.getUTCFullYear()
    const bYear = bDt.getUTCFullYear()
    const aMonth = aDt.getUTCMonth()
    const bMonth = bDt.getUTCMonth()

    if (aYear === bYear && aMonth === bMonth) stop = true
    else {
      aDt.setUTCMonth(aDt.getUTCMonth() - 1)
      monthsDiff++
    }
  }
  return monthsDiff
}

// Calc the cumulative caseload for X months from the most recent data point.
Util.getCumulativeCount = (data, nMonth = 12, lagMonths = 0) => {
  data.reverse()

  if (data.length === 0) {
    return { value: null }
  }

  let cumulativeCount = 0
  let nCounted = 0
  let nNull = 0
  let cumulativeNull = true

  const first = data[0]
  const firstDt = new Date(first.date_time.replace(/-/g, '/'))

  // cycle thru lag
  const startDt = new Date(firstDt)
  startDt.setUTCMonth(startDt.getUTCMonth() - lagMonths)

  // count from startDt
  let end, start
  for (let i = 0; i < data.length; i++) {
    const datum = data[i]
    const thisDt = new Date(datum.date_time.replace(/-/g, '/'))
    if (thisDt > startDt) continue
    else if (start === undefined) start = datum
    if (nCounted + nNull === nMonth) break
    end = datum
    if (datum.value !== null) {
      cumulativeNull = false
      nCounted++
      cumulativeCount += datum.value
    } else {
      nNull++
    }
  }
  // return a datum
  data.reverse()

  return {
    data_source: start.data_source,
    date_time: start.date_time,
    end: start.date_time,
    start: end.date_time,
    definition: 'Sum of total cases in past ' + nMonth + ' months',
    metric: 'calc_cumcaseload_' + nMonth + 'month',
    observation_id: 0,
    place_fips: start.place_fips,
    place_id: start.place_id,
    place_iso: start.place_iso,
    place_name: start.place_name,
    stale_flag: start.stale_flag,
    updated_at: start.updated_at,
    value: cumulativeCount,
    n_null: nNull
  }
}

// Calculate percent change between two values
Util.getPercentChange = (prv, cur) => {
  const diff = cur - prv
  if (diff === 0) return 0
  else if (prv === 0) {
    if (diff < 0) return -1000000000
    else return 1000000000
  } else {
    return diff / prv
  }
}

Util.getCumulativeTrend = (data, end, lagMonths = 12) => {
  const start = Util.getCumulativeCount(
    data,
    lagMonths, // n months
    lagMonths // lag months
  )

  const percentChange = Util.getPercentChange(start.value, end.value)

  return {
    change_per_period: end.value - start.value,
    definition:
      'Change in cumulative case count for ' + lagMonths + '-month period',
    end_date: end.date_time,
    end_obs: end.observation_id,
    metric: 'caseload_totalpop',
    percent_change: !isNaN(percentChange) ? percentChange : null,
    place_fips: start.place_fips,
    place_id: start.place_id,
    place_iso: start.place_iso,
    place_name: start.place_name,
    stale_flag: start.stale_flag,
    updated_at: start.updated_at,
    start_date: start.date_time,
    start_obs: start.observation_id,
    startDatum: start,
    endDatum: end,
    incomplete: start.n_null > 0 || end.n_null > 0
  }
}

/**
 * Return + if delta > 0, - if less, none otherwise.
 * @method getDeltaSign
 * @param  {[type]}     deltaVal [description]
 * @return {[type]}              [description]
 */
Util.getDeltaSign = deltaVal => {
  if (deltaVal > 0) {
    return '+'
  } else if (deltaVal < 0) {
    return '-'
  } else {
    return ''
  }
}

Util.getDeltaWord = deltaVal => {
  if (deltaVal > 0) {
    return 'increase'
  } else if (deltaVal < 0) {
    return 'decrease'
  } else {
    return 'No change'
  }
}

Util.getPeopleNoun = val => {
  if (val === 1) return 'case'
  else return 'cases'
}

Util.getDeltaData = datum => {
  if (datum && datum['percent_change'] !== null) {
    const pct = datum['percent_change']
    let direction
    if (datum.incomplete === true) direction = 'notCalc'
    else if (pct > 0) direction = 'inc'
    else if (pct < 0) direction = 'dec'
    else if (pct === 0) direction = 'same'

    return {
      delta: datum['percent_change'],
      deltaSign: Util.getDeltaSign(datum['percent_change']),
      deltaFmt: Util.percentizeDelta(datum['percent_change']),
      direction: direction
    }
  } else return {}
}

// Color series for change since previous time period in measles caseload.
const valueRed = '#b02c3a'
const valueRed2 = '#d65c68'
const valueGreen = '#006837'
const valueGreen2 = '#14b86b'
Util.changeColors = {
  same: '#fffff2',
  neg: valueGreen,
  negLight: valueGreen2,
  pos: valueRed,
  posLight: valueRed2,
  missing: '#b3b3b3'
}

// Color series used to indicate relative vaccination coverage from least to
// most vaccinated.
Util.vaccinationColors = [
  '#d6f0b2',
  '#b9d7a8',
  '#7fcdbb',
  '#41b6c4',
  '#2c7fb8',
  '#303d91'
]

// const vaccinationColorScale = (val) => {
//
//   return 'blue';
// };

Util.getMetricChartParams = metric => {
  switch (metric) {
    case 'cumcaseload_totalpop':
      return {
        tickFormat: Util.formatSIInteger,
        sort: 'desc',
        metric: 'cumcaseload_totalpop',
        label: 'Cases in past 12 months',
        dateFmt: allObs => {
          const firstObs = allObs[0]
          const firstObsDt = new Date(firstObs.date_time.replace(/-/g, '/'))
          const fakeObsDt = new Date(firstObsDt)
          fakeObsDt.setUTCFullYear(fakeObsDt.getUTCFullYear() - 1)
          fakeObsDt.setUTCMonth(fakeObsDt.getUTCMonth() + 1)

          const firstStr = fakeObsDt.toLocaleString('en-us', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC'
          })
          const lastStr = firstObsDt.toLocaleString('en-us', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC'
          })

          return `${firstStr} to ${lastStr}`
        }
      }
    case 'caseload_totalpop':
      return {
        tickFormat: Util.formatSIInteger,
        tickFormatLong: Util.comma,
        metric: 'caseload_totalpop',
        units: 'cases',
        getUnits: val => (val === 1 ? 'case' : 'cases'),
        sort: 'desc',
        label: 'Total cases of measles',
        name: 'Total cases of measles'
      }
    case 'incidence_monthly':
      return {
        tickFormat: Util.formatIncidence,
        tickFormatLong: Util.formatIncidence,
        metric: 'incidence_monthly',
        sort: 'desc',
        units: 'cases per 1M population',
        getUnits: val =>
          val === 1 ? 'case per 1M population' : 'cases per 1M population',
        label: 'Monthly incidence of measles (cases per 1M population)',
        name: 'Monthly incidence rate'
      }
    case 'incidence_yearly':
      return {
        tickFormat: Util.formatIncidence,
        tickFormatLong: Util.formatIncidence,
        metric: 'incidence_yearly',
        sort: 'desc',
        units: 'cases per 1M population',
        getUnits: val =>
          val === 1 ? 'case per 1M population' : 'cases per 1M population',
        label: 'Yearly incidence of measles (cases per 1M population)',
        name: 'Yearly incidence rate'
      }
    case 'monthlycaseload_totalpop':
      return {
        tickFormat: Util.formatSIInteger,
        tickFormatLong: Util.comma,
        metric: 'monthlycaseload_totalpop',
        sort: 'desc',
        temporal_resolution: 'monthly',
        label: 'Cases reported globally'
      }

    case 'coverage_mcv1_infant': // DEBUG
      return {
        tickFormat: Util.percentize,
        tickFormatLong: Util.percentize,
        metric: 'coverage_mcv1_infant',
        temporal_resolution: 'yearly',
        sort: 'asc',
        label: 'Vaccination coverage (% of infants)',
        dateFmt: allObs => Util.getDatetimeStamp(allObs[0], 'year')
      }

    case 'avg_coverage_mcv1_infant': // DEBUG
      return {
        tickFormat: Util.percentize,
        tickFormatLong: Util.percentize,
        metric: 'avg_coverage_mcv1_infant',
        temporal_resolution: 'yearly',
        sort: 'asc',
        defaultTicks: [0, 50, 100],
        label: 'Average vaccination coverage',
        dateFmt: allObs => Util.getDatetimeStamp(allObs[0], 'year')
      }
  }
}

Util.setColorScaleProps = (metric, colorScale) => {
  switch (metric) {
    case 'incidence_12months':
    case 'cumcaseload_totalpop':
    case 'caseload_totalpop':
    case 'incidence_monthly':
      colorScale.interpolate(d3.interpolateRgb).range(['#e6c1c6', '#b02c3a'])
      return

    case 'coverage_mcv1_infant': // DEBUG
      colorScale
        .interpolate(d3.interpolateRgbBasis)
        .range(Util.vaccinationColors)
      return
  }
}

Util.getColorScaleForMetric = (metric, domain) => {
  switch (metric) {
    case 'incidence_12months':
    case 'cumcaseload_totalpop':
    case 'caseload_totalpop':
    case 'incidence_monthly':
      return d3
        .scaleLinear()
        .range(['#e6c1c6', '#b02c3a'])
        .domain(domain)
      return

    case 'coverage_mcv1_infant': // DEBUG
      return val => {
        return d3.interpolateRgbBasis(Util.vaccinationColors)(val / 100)
      }
  }
}

Util.getIntArray = (min, max) => {
  const list = []
  for (let i = min; i <= max; i++) {
    list.push(i)
  }
  return list
}

Util.getScatterLabelData = datum => {
  switch (datum.metric || datum) {
    case 'incidence_12months':
    case 'caseload_totalpop':
      return 'Total measles cases reported'
    case 'incidence_monthly':
      return 'Monthly incidence of measles'
    case 'coverage_mcv1_infant':
      return 'Vaccination coverage'
    default:
      return ''
  }
}

Util.getSvgChartLabelData = datum => {
  switch (datum.metric) {
    case 'caseload_totalpop':
      return ['Cases reported']
    case 'incidence_monthly': // DEBUG
      return ['Global yearly', 'incidence']
    default:
      // DEBUG
      return ['Global vaccination', 'coverage']
  }
}

Util.getUTCDate = dt => {
  const utcYear = dt.getUTCFullYear()
  const utcMonth = dt.getUTCMonth()
  const utcDt = new Date(`${utcYear}/${utcMonth + 1}/1`)
  return utcDt
}

Util.getLocalDate = dt => {
  let utcYear = dt.getFullYear()
  const utcMonth = dt.getMonth() % 12
  if (utcMonth !== dt.getMonth()) utcYear++
  const utcDt = new Date(`${utcYear}/${utcMonth + 1}/1`)
  return utcDt
}

Util.getLocalNextMonth = dt => {
  let utcYear = dt.getFullYear()
  const utcMonth = (dt.getMonth() + 1) % 12
  if (utcMonth !== dt.getMonth() + 1) utcYear++
  const utcDt = new Date(`${utcYear}/${utcMonth + 1}/1`)
  return utcDt
}

Util.getTooltipItem = datum => {
  switch (datum.metric) {
    case 'caseload_totalpop':
      return {
        name: 'Cases reported',
        datum: datum,
        period: 'month',
        value: datum.value === null ? null : Util.comma(datum.value),
        label: datum.value === 1 ? 'case' : 'cases'
      }
    case 'incidence_monthly': // DEBUG
      return {
        name: 'Monthly incidence rate',
        datum: datum,
        period: 'month',
        value: datum.value === null ? null : Util.formatIncidence(datum.value),
        label: 'cases per 1M population'
      }
    case 'monthlycaseload_totalpop': // DEBUG
      return {
        name: 'Cases reported',
        datum: datum,
        period: 'month',
        value: Util.comma(datum.value),
        label: 'cases'
      }
    case 'coverage_mcv1_infant': // DEBUG
      return {
        name: 'Vaccination coverage',
        datum: datum,
        period: 'year',
        value: datum.value ? Util.percentize(datum.value) : null,
        label: 'of infants'
      }
    case 'avg_coverage_mcv1_infant': // DEBUG
      return {
        name: 'Average vaccination coverage',
        datum: datum,
        period: 'year',
        value: Util.percentize(datum.value),
        label: 'of infants'
      }
    case 'total_population':
      return {
        name: 'Total population',
        datum: datum,
        period: 'year',
        value: Util.formatSI(datum.value),
        label: 'cases'
      }
  }
}

Util.quantiles = [
  {
    name: 'Very low',
    value: 0.2
  },
  {
    name: 'Low',
    value: 0.6
  },
  {
    name: 'Average',
    value: 1.4
  },
  {
    name: 'High',
    value: 4.1
  }
]

// const getIncidenceQuantile = (allObsTmp, countryObs) => {
Util.getIncidenceQuantile = (countryObs, params = {}) => {
  if (countryObs.value === 0) {
    if (params.type === 'name') return ''
    return -9999
  }

  for (let i = 0; i < Util.quantiles.length; i++) {
    if (countryObs.value < Util.quantiles[i].value) {
      if (params.type === 'name') return Util.quantiles[i].name
      else return i
    } else if (
      i === Util.quantiles.length - 1 &&
      countryObs.value >= Util.quantiles[i].value
    ) {
      if (params.type === 'name') return 'Very high'
      return i + 1
    }
  }
  return null

  // const allObs = allObsTmp.filter(o => {
  //   return o.value && o.value !== null && o.value > 0;
  // })
  // .map(o => o.value)
  // .sort();
  //
  // const quartiles = [
  //   d3.quantile(allObs, .25),
  //   d3.quantile(allObs, .5),
  //   d3.quantile(allObs, .75),
  // ];
  //
  //
  // if (countryObs.value < quartiles[0]) {
  //   return 0;
  // }
  // else if (countryObs.value < quartiles[1]) {
  //   return 1;
  // }
  // else if (countryObs.value < quartiles[2]) {
  //   return 2;
  // }
  // else if (countryObs.value >= quartiles[2]) {
  //   return 3;
  // } else return null;
}

const getApiUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    if (window.location.href.search('https') > -1)
      return 'https://measles-api.talusanalytics.com'
    else return 'http://measles-api-dev.us-west-1.elasticbeanstalk.com/'
  } else return 'http://localhost:5002'
}

Util.API_URL = getApiUrl()

Util.getDateTimeRange = item => {
  const data = item.value
  if (data === null) return ''
  const first = data[0]['date_time']
  const last = data[data.length - 1]['date_time']

  if (first === undefined) return ''

  const firstStr = new Date(first.replace(/-/g, '/')).toLocaleString('en-us', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  })
  const firstStrNoYear = new Date(first.replace(/-/g, '/')).toLocaleString(
    'en-us',
    {
      month: 'short',
      timeZone: 'UTC'
    }
  )
  const lastStr = new Date(last.replace(/-/g, '/')).toLocaleString('en-us', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  })
  const sameYear = first.slice(0, 4) === last.slice(0, 4)

  if (firstStr === lastStr) return `${firstStr}`
  else if (sameYear) return `${firstStrNoYear} to ${lastStr}`
  else return `${firstStr} to ${lastStr}`
}

Util.formatDatetimeApi = dt => {
  const year = dt.getFullYear()
  const monthTmp = dt.getMonth() + 1
  const month = monthTmp > 9 ? '' + monthTmp : '0' + monthTmp

  const dateTmp = dt.getDate()
  const date = dateTmp > 9 ? '' + dateTmp : '0' + dateTmp

  // const hoursTmp = dt.getHours();
  // const hours = hoursTmp > 9 ? ('' + hoursTmp) : ('0' + hoursTmp);
  //
  // const minutesTmp = dt.getMinutes();
  // const minutes = minutesTmp > 9 ? ('' + minutesTmp) : ('0' + minutesTmp);
  //
  // const secondsTmp = dt.getSeconds();
  // const seconds = secondsTmp > 9 ? ('' + secondsTmp) : ('0' + secondsTmp);

  const yyyymmdd = `${year}-${month}-${date}`
  return `${yyyymmdd}`
  // const hhmmss = `${hours}:${minutes}:${seconds}`;
  // return `${yyyymmdd}T${hhmmss}`;
}

Util.globalMaxDate = () => {
  const globalMaxDate = new Date()
  globalMaxDate.setDate(1)
  globalMaxDate.setMonth(9)
  globalMaxDate.setYear(2019)
  return globalMaxDate
}

Util.today = () => {
  const today = new Date()
  // today.setDate(1)
  // today.setMonth(0)
  return today // TODO put time traveling here if needed
}

Util.getDatetimeStamp = (datum, type = 'year') => {
  if (!datum || datum['value'] === null) return ''

  let datetimeStamp
  const date_time = datum['date_time'].replace(/-/g, '/')
  if (type === 'month') {
    datetimeStamp = new Date(date_time).toLocaleString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    })
  } else if (type === 'year') {
    datetimeStamp = new Date(date_time).toLocaleString('en-US', {
      year: 'numeric',
      timeZone: 'UTC'
    })
  }
  return `${datetimeStamp}`
}

Util.importAll = r => {
  let images = {}
  r.keys().map((item, index) => {
    images[item.replace('./', '')] = r(item)
  })
  return images
}

// Sorting functions to sort alerts and statuses data by datetime and by
// unique ID (sequential relative to submission order).
Util.sortByDatetime = (a, b) => {
  const dateA = new Date(a.effective_dtm)
  const dateB = new Date(b.effective_dtm)
  if (dateA > dateB) return -1
  if (dateA < dateB) return 1
  return 0
}
Util.sortByAlertId = (a, b) => {
  if (a.alert_id > b.alert_id) return -1
  if (a.alert_id < b.alert_id) return 1
  return 0
}
Util.sortByDetailsId = (a, b) => {
  if (a.details_id > b.details_id) return -1
  if (a.details_id < b.details_id) return 1
  return 0
}
Util.sortByName = (a, b) => {
  if (a.name > b.name) return -1
  if (a.name < b.name) return 1
  return 0
}
Util.sortByField = field => {
  return (a, b) => {
    if (a[field] > b[field]) return -1
    if (a[field] < b[field]) return 1
    return 0
  }
}

// Percentize number
Util.percentize = val => {
  return parseFloat(val).toFixed(0) + '%'
}

// Format delta value
Util.percentizeDelta = deltaTmp => {
  const delta = Math.abs(deltaTmp)
  const d3Format = d3.format(',.0%')
  const d3FormattedNum = d3Format(delta)

  if (Math.abs(delta) > 1) return '>100%'

  if (d3FormattedNum === '0%' && delta !== 0) {
    return '<1%'
  } else {
    return d3FormattedNum
  }
}

// Format incidence value
Util.formatIncidence = inc => {
  if (inc === 0) return '0'
  else if (inc < 0.001) return '<0.001'
  else return Util.formatSI(inc)
}

// Decimalize-ize numbers to one place
Util.decimalizeOne = d3.format('.1f')

// Comma-ize numbers
Util.comma = function(num) {
  const resultTmp = d3.format(',.0f')(num)
  return resultTmp
}

// Format money as comma number with USD suffix
Util.money = val => {
  return Util.comma(val)
}

Util.formatSIInteger = val => {
  if (val === 0) return '0'
  else if (val <= 999) return val
  else return d3.format('.2s')(val)
}

// Format using standard suffixes
Util.formatSI = val => {
  // If zero, just return zero
  if (val === 0) return '0'
  // If 1 or less, return the value with three significant digits. (?)
  else if (val < 1) return d3.format('.3f')(val)
  // If between 1 - 1000, return value with two significant digits.
  else if (val >= 1 && val < 1000) return d3.formatPrefix('.2f', 1)(val)
  // k
  // If 1k or above, return SI value with two significant digits
  else if (val >= 1000 && val < 1000000)
    return d3.formatPrefix('.2f', 1000)(val)
  // k
  // If 1k or above, return SI value with two significant digits
  else if (val >= 1000000 && val < 1000000000)
    return d3.formatPrefix('.2f', 1000000)(val)
  // M
  else
    return d3
      .formatPrefix(',.2s', 1000000000)(val)
      .replace(/G/, 'B') // B
}

/**
 * Capitalizes each word in the input text and returns the result.
 * @method toTitleCase
 * @param  {[string]}    str [Input string.]
 * @return {[string]}        [Capitalized input string]
 */
Util.toTitleCase = str => {
  return str.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  })
}

// Formatting functions for dates and datetimes.
Util.formatDatetime = input => {
  return input.toLocaleString('en-us', {
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    year: 'numeric',
    day: 'numeric'
  })
}
Util.formatDate = input => {
  return input.toLocaleString('en-us', {
    month: 'short',
    year: 'numeric',
    day: 'numeric'
  })
}

Util.getWrappedText = (text, thresh = 20) => {
  // Get label text
  // If it's more than 20 chars try to wrap it
  const tryTextWrap = text.length > thresh
  let svgLabelTspans
  if (tryTextWrap) {
    svgLabelTspans = []

    // Split names by word
    const words = text.split(' ')

    // Concatenate words for each tspan until over 20 chars
    let curTspan = ''
    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      if ((curTspan + ' ' + word).length < thresh) {
        curTspan += ' ' + word
      } else {
        svgLabelTspans.push(curTspan)
        curTspan = word
      }
    }
    if (curTspan !== '') svgLabelTspans.push(curTspan)
  }

  // Otherwise just use the name as-is
  else {
    svgLabelTspans = [text]
  }
  return svgLabelTspans
}

Util.mobilecheck = () => {
  let check = false
  ;(function(a) {
    if (
      /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(
        a
      ) ||
      /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
        a.substr(0, 4)
      )
    )
      check = true
  })(navigator.userAgent || navigator.vendor || window.opera)
  return check
}

export default Util
