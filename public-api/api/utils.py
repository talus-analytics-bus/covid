# Standard libraries
import functools
import json

# Third party libraries
import flask
from pony.orm.core import QueryResult
from werkzeug.exceptions import NotFound


# Returns true if database entity class instance's attribute contains a value
# in the filter set, false otherwise.
def passes_filters(instance, filters):
    instancePasses = True
    for filterSetName in filters:

        # Get filter set
        filterSet = set(filters[filterSetName])

        # Get instance attribute values
        instanceSetTmp = getattr(instance, filterSetName)

        # If wrong type, cast to set
        instanceSet = None
        if type(instanceSetTmp) != set:
            instanceSet = set([instanceSetTmp])
        else:
            instanceSet = instanceSetTmp

        # If instance fails one filter, it fails completely.
        if len(instanceSet & filterSet) == 0:
            passes = False
    return instancePasses

# A decorator to format API responses (Query objects) as
# { data: [{...}, {...}] }
def format_response(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            # Load unformatted data from prior function return statement.
            unformattedData = func(*args, **kwargs)

            # Init formatted data.
            formattedData = []

            # If the type of unformatted data was a query result, parse it as
            # items in a dictionary.
            if type(unformattedData) == QueryResult:
                formattedData = [r.to_dict() for r in unformattedData]
            # Otherwise, it is a tuple or list, and should be returned directly.
            else:
                formattedData = unformattedData[:]
            results = {
                "data": formattedData, "error": False, "message": "Success"
            }

        # If there was an error, return it.
        except NotFound:
            results = {
                "data": request.path, "error": True, "message": "404 - not found"
            }
        except Exception as e:
            print(e)
            results = {
                "data": '',
                "error": True,
                "message": str(e),
            }

        # Convert entire response to JSON and return it.
        return flask.jsonify(results)

    # Return the function wrapper (allows a succession of decorator functions to
    # be called)
    return wrapper
