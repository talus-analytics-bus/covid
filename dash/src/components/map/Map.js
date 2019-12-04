import React from 'react'
import ReactMapGL, { Marker, NavigationControl, Popup } from 'react-map-gl'
import * as d3 from 'd3/dist/d3.min'
import TrendQuery from '../misc/TrendQuery.js'
import Util from '../misc/Util.js'
import ObservationQuery from '../misc/ObservationQuery.js'
import 'mapbox-gl/dist/mapbox-gl.css'
import './map.scss'
import styles from './map.module.scss'
import initMap from './mapUtils'
import Legend from './legend/Legend'
import ResetZoom from './resetZoom/ResetZoom'
import GeomPopup from './geomPopup/GeomPopup.js'
import classNames from 'classnames'

const TOKEN = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN

const Map = ({
  fillObservations,
  bubbleObservations,
  trendObservations,
  incidenceObservations,
  mappedFacilityTypes,
  setMappedFacilityTypes,
  setLoadingNav,
  ...props
}) => {
  const defaultViewport = {
    width: '100%',
    height: '100%',
    longitude: 33.73046875000961,
    latitude: 4.418504408489266,
    zoom: 2
  }
  const [viewport, setViewport] = React.useState(defaultViewport)
  const [selectedGeomID, setSelectedGeomID] = React.useState(-1)
  const [cursorLngLat, setCursorLngLat] = React.useState([0, 0])
  const [showGeomPopup, setShowGeomPopup] = React.useState(false)
  const [popupData, setPopupData] = React.useState({})
  const [markersLoaded, setMarkersLoaded] = React.useState(false)

  // Whether the reset button is shown or not. Controlled by the viewport
  // setting being other than the default.
  const [showReset, setShowReset] = React.useState(false)

  // HTML markers for bubbles
  const [markerComponents, setMarkerComponents] = React.useState([])

  const [showDataToggles, setShowDataToggles] = React.useState(false)

  // Track current bubble metric:
  // caseload_totalpop
  // incidence_monthly
  const [bubbleMetric, setBubbleMetric] = React.useState('caseload_totalpop')
  const [bubbleColorIsTrend, setBubbleColorIsTrend] = React.useState(true)

  let mapRef = React.createRef()
  const showTrendColor = ({ map, show }) => {
    // If the map argument was not defined or the map reference is not null,
    // get the map variable from the mapRef.
    const getMapFromRef = mapRef !== null || map === undefined
    if (getMapFromRef) map = mapRef.getMap()

    // Step-wise color scheme from white to 5 shades of red marking whether an
    // increase in measles caseload since the previous month was varying levels
    // of significance.
    // Define red base color.
    const redScale = Util.getColorScaleForMetric('caseload_totalpop', [0, 100])

    // Define color stop points
    const stops = [0, 1 / 3, 2 / 3, 3 / 3]
    const stops5 = [0, 0.2, 0.4, 0.6, 0.8, 1]
    // const stops = [[0, 0], [0.2, 20], [0.4, 40], [0.6, 60], [0.8, 80], [1, 100]]
    stops.reverse()

    // Define the color scheme.
    const bubbleTrendStops = [
      'case',
      ['==', ['feature-state', 'value3'], null],
      Util.changeColors.missing,
      ['==', ['feature-state', 'value3'], 0],
      Util.changeColors.same
      // ['>=', ['feature-state', 'value3'], thresh],
      // '#b02c3a',
      // Util.changeColors.same
    ]

    stops.forEach(stop => {
      bubbleTrendStops.push(['>=', ['feature-state', 'value3'], stop])
      bubbleTrendStops.push(redScale(stop * 100))
      console.log('\n')
      console.log(stop)
      console.log(d3.color(redScale(stop * 100)).formatHex())
    })

    bubbleTrendStops.push(Util.changeColors.same)

    // Color scheme binary from white to red marking whether any increase in
    // measles caseload since the previous month was significant (greater than
    // or equal to a threshold percentage change value) or not.
    const thresh = 0.3
    const bubbleTrendThreshold = [
      'case',
      ['==', ['feature-state', 'value3'], null],
      Util.changeColors.missing,
      ['==', ['feature-state', 'value3'], 0],
      Util.changeColors.same,
      ['>=', ['feature-state', 'value3'], thresh],
      '#b02c3a',
      Util.changeColors.same
    ]

    // Color scheme gradient from green to white to red that marks the decrease
    // or increase since the previous month in measles caseload/incidence.
    const bubbleTrendLinearInterpIncOnly = [
      'case',
      ['==', ['feature-state', 'value3'], null],
      Util.changeColors.missing,
      ['<=', ['feature-state', 'value3'], 0],
      Util.changeColors.same,
      [
        'interpolate',
        ['linear'],
        ['feature-state', 'value3'],
        0,
        Util.changeColors.same,
        1,
        Util.changeColors.pos
      ]
    ]

    // Color scheme gradient from green to white to red that marks the decrease
    // or increase since the previous month in measles caseload/incidence.
    const bubbleTrendLinearInterpOrig = [
      'case',
      ['==', ['feature-state', 'value3'], null],
      Util.changeColors.missing,
      ['==', ['feature-state', 'value3'], 0],
      Util.changeColors.same,
      [
        'interpolate',
        ['linear'],
        ['feature-state', 'value3'],
        -1,
        Util.changeColors.neg,
        0,
        Util.changeColors.same,
        1,
        Util.changeColors.pos
      ]
    ]

    const bubbleTrend = bubbleTrendThreshold

    const bubbleRed = [
      'case',
      ['==', ['feature-state', 'stale'], false],
      '#b02c3a',
      ['==', ['feature-state', 'stale'], true],
      '#b02c3a',
      'white'
    ]

    // Show or hide bubble trend color as needed.
    if (show) {
      map.setPaintProperty(
        'metric-bubbles-incidence_monthly',
        'circle-color',
        bubbleTrend
      )
      map.setPaintProperty(
        'metric-bubbles-caseload_totalpop',
        'circle-color',
        bubbleTrend
      )
    } else {
      map.setPaintProperty(
        'metric-bubbles-incidence_monthly',
        'circle-color',
        bubbleRed
      )
      map.setPaintProperty(
        'metric-bubbles-caseload_totalpop',
        'circle-color',
        bubbleRed
      )
    }
  }

  // Given incidence value, return scaled linear radius of marker.
  const markerSizeScale = d3
    .scaleLinear()
    .domain([0.001, 100]) // expected incidence value range
    .range([5 * 2, 150 * 2])
  function getMarkerStyle(value) {
    if (value === 0)
      return {
        height: '0px',
        width: '0px'
      }
    else
      return {
        height: markerSizeScale(value) + 'px',
        width: markerSizeScale(value) + 'px'
      }
  }

  function getMarkerComponents(map, observations) {
    const newMarkerComponents = []

    observations.forEach(observation => {
      const value = observation['value']
      const place_id = observation['place_id']

      if (!value) {
        // map.setFeatureState({source: 'centroids', sourceLayer: 'mvmupdatescentroidsv2', id: place_id }, {value: 0});
      } else {
        //const state = { value: Math.floor(256 * value)};
        const state = { value: value }
        // map.setFeatureState({source: 'centroids', sourceLayer: 'mvmupdatescentroidsv2', id: place_id }, state);
        const featureState = map.getFeatureState({
          source: 'centroids',
          sourceLayer: 'mvmupdatescentroidsv2',
          id: place_id
        })
        if (featureState.lat !== null && featureState.lon !== null) {
          // Get size (height and width) of marker according to the linear scale
          const markerStyle = getMarkerStyle(featureState.value)
          newMarkerComponents.push(
            <Marker latitude={featureState.lat} longitude={featureState.lon}>
              <div style={markerStyle} className={'general-marker'} />
            </Marker>
          )
        }
      }
    })

    setMarkerComponents(newMarkerComponents)
  }

  React.useEffect(() => {
    const map = mapRef.getMap()

    initMap(
      map,
      fillObservations,
      bubbleObservations,
      incidenceObservations,
      trendObservations,
      bubbleMetric,
      function afterMapLoaded() {
        map.setLayoutProperty(
          'metric-bubbles-' + bubbleMetric,
          'visibility',
          'visible'
        )
        if (!showDataToggles) setShowDataToggles(true)

        // Show bubble trend color if selected.
        showTrendColor({
          map: map,
          show: bubbleColorIsTrend
        })
      }
    )
    setLoadingNav(false)
  }, [])

  // When bubble metric is changed, show/hide the appropriate bubble layers.
  React.useEffect(
    function setBubbleLayerVisibility() {
      const map = mapRef.getMap()

      // If map is not yet loaded, return
      if (!map.loaded()) {
        return
      }

      // Update map layer visibility to match user selection
      map.setLayoutProperty(
        'metric-bubbles-incidence_monthly',
        'visibility',
        'none'
      )
      map.setLayoutProperty(
        'metric-bubbles-caseload_totalpop',
        'visibility',
        'none'
      )
      map.setLayoutProperty(
        'metric-bubbles-' + bubbleMetric,
        'visibility',
        'visible'
      )
    },
    [bubbleMetric]
  )

  const navTitleEl = (document.getElementById('navTitle').textContent =
    bubbleMetric === 'incidence_monthly'
      ? 'Measles vaccination coverage and monthly incidence'
      : 'Measles vaccination coverage and caseload')

  /**
   * Reset the viewport to the default values. This is fired when the "Reset"
   * button is clicked.
   * @method resetViewport
   */
  const resetViewport = () => {
    // Hide the reset button after click.
    setShowReset(false)

    // Hide tooltip
    setShowGeomPopup(false)

    // Change viewport back to default.
    setViewport(defaultViewport)
  }

  let hoveredCountry
  /**
   * Fired when mouse moves on map, mainly to handle cursor styling.
   * @method handleMouseMove
   * @param  {obj}        e Mousemove event.
   */
  const handleMouseMove = e => {
    // Get map reference object.
    const map = mapRef.getMap()

    const movedOnMap = e.target.classList.contains('overlays')
    if (!movedOnMap) {
      if (hoveredCountry) {
        setHoverState(
          {
            source: 'geoms',
            sourceLayer: 'countries_id_rpr',
            id: hoveredCountry.id
          },
          false
        )
        setHoverState(
          {
            source: 'centroids',
            sourceLayer: 'mvmupdatescentroidsv2',
            id: hoveredCountry.id
          },
          false
        )
        hoveredCountry = undefined
      }
      return
    }

    // Get list of features under the mouse cursor.
    const features = map.queryRenderedFeatures(e.point)
    const allCountries = map.queryRenderedFeatures({
      sourceLayer: 'countries-id-rpr'
    })

    // Use pointer cursor for any country, grab cursor otherwise.
    let countryFeature = features.find(f => {
      return f['layer']['source-layer'] === 'countries_id_rpr'
    })
    const bubbleFeature = features.find(f => {
      return f['layer']['source-layer'] === 'mvmupdatescentroidsv2'
    })

    const onCountry = countryFeature !== undefined
    const onBubble = bubbleFeature !== undefined

    // Bubble takes precedence
    if (onBubble) {
      countryFeature = allCountries.find(f => f.id === bubbleFeature.id)
    }

    function setHoverState(featureSelector, hoverState) {
      const curFeatureState = map.getFeatureState(featureSelector)
      if (curFeatureState) {
        curFeatureState.hover = hoverState
        map.setFeatureState(featureSelector, curFeatureState)
      }
    }

    // If on country, set to hovered state
    if (onCountry || onBubble) {
      if (hoveredCountry && hoveredCountry.id !== countryFeature.id) {
        setHoverState(
          {
            source: 'geoms',
            sourceLayer: 'countries_id_rpr',
            id: hoveredCountry.id
          },
          false
        )
        setHoverState(
          {
            source: 'centroids',
            sourceLayer: 'mvmupdatescentroidsv2',
            id: hoveredCountry.id
          },
          false
        )
      }
      hoveredCountry = countryFeature
      setHoverState(
        {
          source: 'geoms',
          sourceLayer: 'countries_id_rpr',
          id: hoveredCountry.id
        },
        true
      )
      setHoverState(
        {
          source: 'centroids',
          sourceLayer: 'mvmupdatescentroidsv2',
          id: hoveredCountry.id
        },
        true
      )
    } else {
      if (hoveredCountry) {
        setHoverState(
          {
            source: 'geoms',
            sourceLayer: 'countries_id_rpr',
            id: hoveredCountry.id
          },
          false
        )
        setHoverState(
          {
            source: 'centroids',
            sourceLayer: 'mvmupdatescentroidsv2',
            id: hoveredCountry.id
          },
          false
        )
      }
    }

    // If map is on country or legend toggle, show pointer. Otherwise, show
    // grab.
    map.getContainer().parentElement.parentElement.style.cursor =
      onCountry || onBubble ? 'pointer' : 'grab'
  }

  const handleStyleLoad = map => map.resize()

  /**
   * Fired when map is clicked.
   * @method handleClick
   * @param  {obj}    e Click event.
   */
  const handleClick = e => {
    const movedOnMap = e.target.classList.contains('overlays')
    if (!movedOnMap) {
      return
    }

    /**
     * Returns true if user clicked any part of the legend or the filter menus
     * (rather than directly on the map), and false otherwise.
     * @method clickedMenus
     * @param  {obj}      e Click event.
     * @return {bool}        Boolean result (see description).
     */
    const clickedMenus = e => {
      try {
        if (
          e.target.className.includes('legend') ||
          e.target.className.includes('filter') ||
          e.target.className.includes(styles.dataToggles) ||
          e.target.offsetParent.className.includes('legend') ||
          e.target.offsetParent.className.includes('filter')
        ) {
          return true
        }
      } catch {
        console.log('[Error] Unexpected click event: ')
        console.log(e)
        return false
      }
      return false
    }

    // If the user clicked on the legend and not on the actual map, do nothing.
    // Otherwise, do the correct map interaction.
    if (clickedMenus(e)) return

    // Otherwise, highlight state and show its tooltip.
    const map = mapRef.getMap()

    // If there is a highlighted country, turn it off
    if (selectedGeomID > 0) {
      map.setFeatureState(
        {
          source: 'geoms',
          sourceLayer: 'countries_id_rpr',
          id: selectedGeomID
        },
        { clicked: false }
      )
      map.setFeatureState(
        {
          source: 'centroids',
          sourceLayer: 'mvmupdatescentroidsv2',
          id: selectedGeomID
        },
        { clicked: false }
      )

      const tooltipArr = document.getElementsByClassName('mapboxgl-popup')
      if (tooltipArr.length > 0) {
        const tooltipEl = tooltipArr[0]
        tooltipEl.classList.remove('fadeIn')
        tooltipEl.classList.add('fadeOut')
      }

      setShowGeomPopup(false)
      setSelectedGeomID(-1)
    }

    const clickedOnGeom = e.features.find(f => f.layer.id === 'geom-fills')
    const clickedOnBubble = e.features.find(f =>
      f.layer.id.startsWith('metric-bubbles')
    )

    if (clickedOnGeom === undefined && clickedOnBubble === undefined) return

    // Bubble click takes priority.
    let id, iso, name
    if (clickedOnBubble) {
      id = clickedOnBubble.id
      iso =
        clickedOnBubble.properties.ISO_A2 !== '-99'
          ? clickedOnBubble.properties.ISO_A2
          : clickedOnBubble.properties.WB_A2
      name = clickedOnBubble.properties.NAME
    } else if (clickedOnGeom) {
      id = clickedOnGeom.id
      iso =
        clickedOnGeom.properties.ISO_A2 !== '-99'
          ? clickedOnGeom.properties.ISO_A2
          : clickedOnGeom.properties.WB_A2
      name = clickedOnGeom.properties.NAME
      // console.log('clickedOnGeom')
      // console.log(clickedOnGeom)
    }

    const bubbleData = bubbleObservations.find(f => f.place_id === id)
    const fillData = fillObservations.find(f => f.place_id === id)
    const trendData = trendObservations.find(f => f.place_id === id)
    const incidenceData = incidenceObservations.find(f => f.place_id === id)

    setPopupData({
      place_id: id,
      place_iso: iso,
      place_name: name,
      fill: fillData,
      bubble: bubbleData,
      trend: trendData,
      incidence: incidenceData
    })

    if (id !== selectedGeomID) {
      map.setFeatureState(
        { source: 'geoms', sourceLayer: 'countries_id_rpr', id: id },
        { clicked: true }
      )
      map.setFeatureState(
        { source: 'centroids', sourceLayer: 'mvmupdatescentroidsv2', id: id },
        { clicked: true }
      )
      setSelectedGeomID(id)
      setCursorLngLat(e.lngLat)
      setShowGeomPopup(true)
    } else {
      map.setFeatureState(
        { source: 'geoms', sourceLayer: 'countries_id_rpr', id: id },
        { clicked: false }
      )
      map.setFeatureState(
        { source: 'centroids', sourceLayer: 'mvmupdatescentroidsv2', id: id },
        { clicked: false }
      )
      setSelectedGeomID(-1)
      setShowGeomPopup(false)
    }

    /**
     * Fly user to specified longlat map location, and (if provided) to the
     * final zoom value -- otherwise the zoom value is 150% of the current
     * zoom value or 8, whichever is smaller.
     * @method flyToLongLat
     * @param  {array}     longlat   Longlat coord in decimal deg
     * @param  {float}     finalZoom Zoom value to end on, or null
     * @param  {object}     viewport  Viewport state variable
     * @param  {object}     mapRef    MapBox map reference object
     * @param  {function}     callback    Optional callback function when done
     */
    const flyToLongLat = (
      longlat,
      finalZoom,
      viewport,
      mapRef,
      callback = () => {}
    ) => {
      // Get current zoom level.
      const curZoom = viewport.zoom

      // Set zoom level to fly to (0 to 24 inclusive). Either zoom in by 20% or
      // the minimum zoom level required to see facilities, whichever is
      // smaller. Use final zoom if it specified.
      const flyZoom =
        finalZoom !== null ? finalZoom : Math.min(4, curZoom * 1.5)

      // Start off flying
      let flying = true

      /**
       * When flying stops, update the viewport position to match the place
       * that was flown to.
       * @method onFlyEnd
       */
      function onFlyEnd() {
        // Get map object reference.
        const map = mapRef.getMap()

        // Delete the event listener for the end of movement (we only want it to
        // be called when the current flight is over).
        map.off('moveend', onFlyEnd)

        // If flying,
        if (flying) {
          // Stop flying,
          flying = false

          // Set viewport state to the flight destination and zoom level
          const newViewport = {
            width: '100%',
            height: '100%',
            longitude: longlat[0],
            latitude: longlat[1],
            zoom: flyZoom
          }
          setViewport(newViewport)
          if (callback) callback()
        }
      }

      // Get map object reference.
      const map = mapRef.getMap()

      // Assign event listener so viewport is updated when flight is over.
      map.on('moveend', onFlyEnd)

      // Fly to the position occupied by the clicked cluster on the map.
      map.flyTo({
        center: longlat,
        zoom: flyZoom,
        bearing: 0,
        speed: 2,
        curve: 1,
        easing: function(t) {
          return t
        }
      })

      setShowReset(true)
    }
  }

  const onPopupClose = () => {
    const map = mapRef.getMap()
    const id = selectedGeomID
    map.setFeatureState(
      { source: 'geoms', sourceLayer: 'countries_id_rpr', id: id },
      { clicked: false }
    )
    map.setFeatureState(
      { source: 'centroids', sourceLayer: 'mvmupdatescentroidsv2', id: id },
      { clicked: false }
    )
    setShowGeomPopup(false)
    setSelectedGeomID(-1)
  }

  const getBubbleMarker = (d, map) => {
    return markerComponents[0] // debug
  }

  const renderMarkerComponents = (incidenceObservations, mapRef) => {
    return markerComponents.map(component => component)
  }

  // JSX for bubble metric toggle
  const renderDataToggles = () => {
    const dataToggles = (
      <div
        className={classNames(styles.dataToggles, {
          [styles.visible]: showDataToggles
        })}
      >
        <span>View caseload by</span>
        {[
          {
            metric: 'caseload_totalpop',
            label: 'number of cases'
          },
          {
            metric: 'incidence_monthly',
            label: 'monthly incidence rate'
          }
        ].map((entry, i) => (
          <div className={styles.dataToggle}>
            <label for={entry.value}>
              <input
                type='radio'
                name='bubbleData'
                id={entry.metric}
                value={entry.metric}
                checked={bubbleMetric === entry.metric}
                onClick={() => {
                  setBubbleMetric(entry.metric)
                }}
              />
              {entry.label}
            </label>
          </div>
        ))}
        <div
          className={styles.dataToggle}
          onClick={() => {
            showTrendColor({
              map: undefined,
              show: !bubbleColorIsTrend
            })
            setBubbleColorIsTrend(!bubbleColorIsTrend)
          }}
        >
          <label for='bubbleColor'>
            <input
              type='checkbox'
              name='bubbleColor'
              checked={bubbleColorIsTrend}
            />
            show trend color
          </label>
        </div>
      </div>
    )
    return dataToggles
  }

  // Get legend labeling based on bubble metric
  const getLegendBubbleLabeling = bubbleMetric => {
    if (bubbleMetric === 'incidence_monthly') {
      return {
        navName: 'incidence of measles',
        sectionName: 'Last reported monthly incidence',
        // sectionName: 'Incidence of measles (monthly)',
        noun: 'incidence'
      }
    } else if (bubbleMetric === 'caseload_totalpop') {
      return {
        navName: 'cases of measles',
        sectionName: 'Last reported caseload',
        noun: 'cases'
      }
    } else {
      console.log('[Error] unexpected metric: ' + bubbleMetric)
      return {}
    }
  }
  const legendBubbleLabeling = getLegendBubbleLabeling(bubbleMetric)

  return (
    <ReactMapGL
      captureClick={true}
      ref={map => {
        mapRef = map
      }}
      mapboxApiAccessToken={TOKEN}
      mapStyle='mapbox://styles/traethethird/ck0ia6pvc2cpc1cpe5nx5b7p5'
      {...viewport}
      maxZoom={4}
      minZoom={2}
      onViewportChange={v => {
        // Update viewport.
        setViewport(v)

        // If viewport deviates from the default zoom or longlat, show the
        // "Reset" button in the bottom left. Otherwise, hide it.
        if (
          v.zoom !== defaultViewport.zoom ||
          v.longitude !== defaultViewport.longitude ||
          v.latitude !== defaultViewport.latitude
        )
          setShowReset(true)
        else setShowReset(false)
      }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onStyleLoad={handleStyleLoad}
      doubleClickZoom={false} //remove 300ms delay on clicking
    >
      {renderDataToggles()}
      {markerComponents.length > 0 &&
        renderMarkerComponents(incidenceObservations, mapRef)}
      <div
        style={{
          position: 'absolute',
          bottom: '30px',
          left: 0,
          padding: '10px'
        }}
      >
        <NavigationControl />
      </div>
      <Legend
        legendBubbleLabeling={legendBubbleLabeling}
        bubbleColorIsTrend={bubbleColorIsTrend}
      />
      {showReset && <ResetZoom handleClick={resetViewport} />}
      {showGeomPopup && (
        <Popup
          id='tooltip'
          longitude={cursorLngLat[0]}
          latitude={cursorLngLat[1]}
          closeButton={false}
          closeOnClick={false}
          onClose={onPopupClose}
          className={'fadingEffect fadeIn'}
          interactive={true}
        >
          <GeomPopup popupData={popupData} bubbleMetric={bubbleMetric} />
        </Popup>
      )}
    </ReactMapGL>
  )
}

export default Map
