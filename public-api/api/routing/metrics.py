# Standard libraries
from datetime import datetime

# Third party libraries
from flask import request
from flask_restplus import Resource
from pony.orm import db_session

# Local libraries
from ..models import db
from ..db import api
from .. import schema
from ..utils import format_response

strf_str = '%Y-%m-%d %H:%M:%S %Z'

# Initialize metric catalog or specifics endpoint
@api.route("/metric", methods=["GET"])
class Metric(Resource):
    parser = api.parser()
    parser.add_argument('metric_id', type=int, required=False,
                        help="""Unique ID of metric for which we're requesting info.
                             If not provided, all metrics are returned.""")

    @api.doc(parser=parser)
    @db_session
    @format_response
    def get(self):
        params = request.args
        res = schema.getMetrics(params)
        return res


# Initialize get metric observations between datetimes
@api.route("/observations", methods=["GET"])
class Observations(Resource):
    parser = api.parser()
    parser.add_argument('metric_id', type=int, required=True,
                        help="Unique ID of metric for which observiations should be returned.")
    parser.add_argument('start', type=datetime, required=False,
                        help="""Time of first observation to be returned. If not provided,
                                min_time for the metric is used.""")
    parser.add_argument('end', type=datetime, required=False,
                        help="""Time of last observation to be returned. If not provided,
                                max_time for the metric is used.""")
    parser.add_argument('temporal_resolution', type=str, required=False, default='planet',
                        choices=('yearly', 'monthly', 'weekly', 'daily'),
                        help="""Temporal resolution to use. Throws error if higher resolution
                                than metric. Provides a summary at that level if lower.
                                If not provided, native resolution of metric is returned.""")
    parser.add_argument('spatial_resolution', type=str, required=False, default='yearly',
                        choices=('planet', 'country', 'state', 'county', 'block_group',
                                 'tract', 'point'),
                        help="""Spatial resolution to use. Throws error if higher resolution
                                than metric. Provides a summary at that level if lower.
                                If not provided, native resolution of metric is returned.""")
    parser.add_argument('place_id', type=int, required=False,
                        help="""Optional place id to limit metric to only that location.""")

    @api.doc(parser=parser)
    @db_session
    @format_response
    def get(self):
        params = request.args
        (view_flag, res, lag) = schema.getObservations(params)

        if view_flag:
            res_list = []

            lagged_places = []

            if lag is not None and len(lag) > 0:
                for o in lag:
                    res_list.append({
                      'data_source': o[1],
                      'date_time': o[2].strftime('%Y-%m-%d %H:%M:%S %Z'),
                      'definition': o[3],
                      'metric': o[4],
                      'observation_id': o[5],
                      'place_fips': o[6],
                      'place_id': o[7],
                      'place_iso': o[8],
                      'place_name': o[9],
                      'updated_at': o[10],
                      'value': o[11],
                      'stale_flag': True,
                    })

                    lagged_places.append(o[7])

            for o in res:

                if o.place_id in lagged_places:
                    continue
                res_list.append({
                  'data_source': o[1],
                  'date_time': o[2].strftime('%Y-%m-%d %H:%M:%S %Z'),
                  'definition': o[3],
                  'metric': o[4],
                  'observation_id': o[5],
                  'place_fips': o[6],
                  'place_id': o[7],
                  'place_iso': o[8],
                  'place_name': o[9],
                  'updated_at': o[10],
                  'value': o[11],
                  'stale_flag': False,
                })

            res_list.sort(key=lambda o: (o['place_id'], o['date_time']))

            return res_list
        else:
            formattedData = [r.to_dict(related_objects=True) for r in res]

            if lag is not None and len(lag) > 0:
                lagData = [r.to_dict(related_objects=True) for r in lag]

                formattedData = [o for o in formattedData if o['value'] is not None]

                for o in formattedData:
                    o['stale_flag'] = False
                for o in lagData:
                    o['stale_flag'] = True

                formattedData.extend(lagData)

            for o in formattedData:
                metric_info = o['metric'].to_dict()
                o['metric'] = metric_info['metric_name']
                o['definition'] = metric_info['metric_definition']

                o['date_time'] = o['date_time'].to_dict()['datetime'].strftime(strf_str)

                place_info = o['place'].to_dict()
                o['place_id'] = place_info['place_id']
                o['place_name'] = place_info['name']
                o['place_iso'] = place_info['iso2']
                o['place_fips'] = place_info['fips']
                del[o['place']]

        formattedData.sort(key=lambda o: (o['place_id'], o['date_time']))

        return formattedData


# Initialize get trend between end and lag # of periods prior
@api.route("/trend", methods=["GET"])
class Trend(Resource):
    parser = api.parser()
    parser.add_argument('metric_id', type=int, required=True,
                        help="Unique ID of metric for which observiations should be returned.")
    parser.add_argument('end', type=datetime, required=True,
                        help="""End of the trending period to use. We'll compare the beginning
                                indicated by the lag to this period to get absolute and percent
                                change.""")
    parser.add_argument('lag', type=int, required=True,
                        help="""Number of periods back to compare 'end' to. Will be in metric's
                                native resolution (so a monthly metric will go back <lag>
                                months)""")
    parser.add_argument('place_id', type=int, required=False,
                        help="""Optional place id to limit metric to only that location.""")

    @api.doc(parser=parser)
    @db_session
    @format_response
    def get(self):
        params = request.args
        (view_flag, place_lists, start, end) = schema.getTrend(params)

        lag = int(params['lag'])

        start_dict = {}
        end_dict = {}

        if view_flag:
            for place_id, place_list in place_lists.items():
                counter = 0

                for o in place_list:
                    o_date = o[2]
                    o_dict = {
                      'data_source': o[1],
                      'no_tz': o_date.replace(tzinfo=None),
                      'date_time': o_date.strftime(strf_str),
                      'definition': o[3],
                      'metric': o[4],
                      'observation_id': o[5],
                      'place_fips': o[6],
                      'place_id': place_id,
                      'place_iso': o[8],
                      'place_name': o[9],
                      'updated_at': o[10],
                      'value': o[11],
                    }

                    if counter == 0:
                        start_dict[place_id] = o_dict
                        counter += 1
                    else:
                        end_dict[place_id] = o_dict
        else:
            for place_id, place_list in place_lists.items():
                formattedData = [r.to_dict(related_objects=True) for r in place_list]
                counter = 0

                for o in formattedData:
                    o_date = o['date_time'].to_dict()['datetime']

                    metric_info = o['metric'].to_dict()
                    o['metric'] = metric_info['metric_name']
                    o['definition'] = metric_info['metric_definition']

                    o['no_tz'] = o_date.replace(tzinfo=None)

                    o['date_time'] = o_date.strftime(strf_str)

                    place_info = o['place'].to_dict()
                    place_id = place_info['place_id']
                    o['place_id'] = place_id
                    o['place_name'] = place_info['name']
                    o['place_iso'] = place_info['iso2']
                    o['place_fips'] = place_info['fips']
                    del[o['place']]

                    if counter == 0:
                        start_dict[place_id] = o
                        counter += 1
                    else:
                        end_dict[place_id] = o

        trends = []

        for place, end_obs in end_dict.items():
            try:
                start_obs = start_dict[place]
            except KeyError:
                print(f'No matching observiation for place: {place}')
                break

            trend = {}
            trend['metric'] = end_obs['metric']
            trend['definition'] = end_obs['definition']

            trend['start_date'] = start_obs['date_time']
            trend['end_date'] = end_obs['date_time']

            start_value = start_obs['value']
            end_value = end_obs['value']

            trend['start_obs'] = start_value
            trend['end_obs'] = end_value

            try:
                trend['percent_change'] = (end_value - start_value) / start_value
            except (TypeError, ZeroDivisionError):
                if end_value is None:
                    trend['percent_change'] = None
                elif start_value == 0 and end_value > 0:
                    trend['percent_change'] = 1e10  # TODO make infinity
                elif start_value == 0 and end_value < 0:
                    trend['percent_change'] = -1e10  # TODO make neg infinity
                elif start_value == 0 and end_value == 0:
                    trend['percent_change'] = 0
                else:
                    trend['percent_change'] = None

            try:
                trend['change_per_period'] = (end_value - start_value) / lag
            except (TypeError, ZeroDivisionError):
                trend['change_per_period'] = None

            trend['place_id'] = place
            trend['place_name'] = end_obs['place_name']
            trend['place_iso'] = end_obs['place_iso']
            trend['place_fips'] = end_obs['place_fips']

            no_tz_date = end_obs['no_tz']

            # FIXME: make this work for realz
            if no_tz_date == end:
                trend['stale_flag'] = False
            else:
                trend['stale_flag'] = True

            trends.append(trend)

        return trends

# Initialize places catalog or specifics endpoint
@api.route("/places", methods=["GET"])
class Places(Resource):
    parser = api.parser()
    parser.add_argument('id', type=int, required=False,
                        help="""Unique ID of place for which we're requesting info.
                             If not provided, all places are returned.""")
    parser.add_argument('by_region', type=bool, required=False,
                        help="""If true, returns catalog of places by region.
                             If not provided, places are not returned by region.""")

    @api.doc(parser=parser)
    @db_session
    @format_response
    def get(self):
        params = request.args

        # If we are to organize the places by region, then set the organizing
        # attribute to the name of the region column in the places table.
        organizing_attribute = None
        if 'by_region' in params and params['by_region'] == 'true':
            organizing_attribute = 'region'

        # Setup filters
        filters = {
            'place_type': ['country'],
        }

        # Get and return places.
        # order = None
        order = [
          "Europe",
          "Eastern Mediterranean",
          "Africa",
          "South-East Asia",
          "Western Pacific",
          "Americas",
          "Unspecified region"
        ];
        res = schema.getEntityInstances(db.Place, 'place_id', organizing_attribute, order, filters, params)
        return res
