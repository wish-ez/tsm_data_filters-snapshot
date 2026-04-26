from flask import Flask, request, render_template
from flask_minify import Minify
from tsm import get_items, tsm_get_auth_credentials
from time import time
from yaml import load, Loader, dump

application = Flask(__name__)
Minify(app=application, html=True, js=True, cssless=True, static=True)
yaml_file = open("config.yml", "r")
config = load(yaml_file, Loader)
realms_cache_file = config['realms_cache_file']

cache_expire_minutes_region = config['cache_expire_minutes_region']
cache_expire_minutes_ah = config['cache_expire_minutes_ah']
cache_path_regions = config['cache_path_regions']
cache_path_ah = config['cache_path_ah']
api_key_updater = config['api_key_updater']
tsm_client_id = config['tsm_client_id']
google_tag = config['google_tag']
reset_cache = config['reset_cache']
cache_version = config['cache_version']

if reset_cache:
    cache_version = int(time())
    config['cache_version'] = cache_version
    # To avoid endless reset
    config['reset_cache'] = False
    with open("config.yml", "w") as yaml_file:
        dump(config, yaml_file)


# To avoid element blinking on page loading
def is_any_settings_in_cookies(cookies) -> bool:
    possible_settings = ('gameVersions', 'regions', 'realms', 'factions')
    for setting in possible_settings:
        if setting in cookies:
            return True
    return False


# To avoid element blinking on page loading
def is_any_filters_in_cookies(cookies) -> bool:
    filters = ('realmBuyoutGoldMin', 'realmBuyoutSilverMin', 'realmBuyoutCopperMin',
               'realmBuyoutGoldMax', 'realmBuyoutSilverMax', 'realmBuyoutCopperMax',
               'realmMarketGoldMin', 'realmMarketSilverMin', 'realmMarketCopperMin',
               'realmMarketGoldMax', 'realmMarketSilverMax', 'realmMarketCopperMax',
               'realmHistoricalGoldMin', 'realmHistoricalSilverMin', 'realmHistoricalCopperMin',
               'realmHistoricalGoldMax', 'realmHistoricalSilverMax', 'realmHistoricalCopperMax',
               'realmNumAuctionsMin',
               'realmNumAuctionsMax',
               'realmNumItemsMin',
               'realmNumItemsMax',
               'regionMarketGoldMin', 'regionMarketSilverMin', 'regionMarketCopperMin',
               'regionMarketGoldMax', 'regionMarketSilverMax', 'regionMarketCopperMax',
               'regionHistoricalGoldMin', 'regionHistoricalSilverMin', 'regionHistoricalCopperMin',
               'regionHistoricalGoldMax', 'regionHistoricalSilverMax', 'regionHistoricalCopperMax',
               'regionAvgSaleGoldMin', 'regionAvgSaleSilverMin', 'regionAvgSaleCopperMin',
               'regionAvgSaleGoldMax', 'regionAvgSaleSilverMax', 'regionAvgSaleCopperMax',
               'regionDailySoldMin',
               'regionDailySoldMax',
               'regionSaleRateMin',
               'regionSaleRateMax',
               )
    cookies_keys = cookies.keys()
    for filter_name in filters:
        if filter_name in cookies_keys:
            return True
    return False


@application.route('/', methods=['GET'])
def main():
    cookies = request.cookies
    is_any_settings = is_any_settings_in_cookies(cookies)
    is_any_filters = is_any_filters_in_cookies(cookies)
    return render_template('main.html',
                           cookies=cookies,
                           cache_version=cache_version,
                           realms_cache_file=realms_cache_file,
                           cache_expire_ah=cache_expire_minutes_ah,
                           cache_expire_region=cache_expire_minutes_region,
                           is_any_settings=is_any_settings,
                           is_any_filters=is_any_filters,
                           google_tag=google_tag
                           )


@application.route('/tsm_data', methods=['POST'])
def tsm_data():
    if request.method == 'POST':
        response = {'data': None,
                    'accessToken': None,
                    'tokenExpires': None,
                    'errors': []
                    }
        api_key = request.form.get('apiKey', '').strip()
        ah_id = int(request.form.get('ahId', ''))
        region_id = int(request.form.get('regionId'))
        data_update = str(request.form.get('dataUpdate'))
        force_cache_update = data_update == 'force' or False
        disable_cache_update = data_update == 'disable' or False
        access_token = request.cookies.get('accessToken')
        token_expires = request.cookies.get('tokenExpires')
        try:
            token_expires = float(token_expires)
        except Exception:
            token_expires = None

        if not access_token or not token_expires or token_expires <= time():
            credentials = tsm_get_auth_credentials(api_key, tsm_client_id)
            if credentials['status_code'] == 200:
                access_token = credentials['access_token']
                token_expires = time() + credentials.get('expires_in', 86400)
            else:
                error_message = f"Can't get access token for API key \"{api_key}\", are you sure you entered " \
                                f"the correct key?<br>TSM API response details:<br>" \
                                f"{credentials['error_details']}"
                response['errors'].append(error_message)
                return response

        items_data = get_items(access_token, region_id, ah_id, cache_expire_minutes_region,
                               cache_expire_minutes_ah, force_cache_update=force_cache_update,
                               disable_cache_update=disable_cache_update)
        response['data'] = {'ah': items_data['ah'],
                            'region': items_data['region'],
                            }
        response['errors'] += items_data['errors']
        response['accessToken'] = access_token
        response['tokenExpires'] = token_expires
        return response


if __name__ == '__main__':
    application.debug = False
    application.run()
