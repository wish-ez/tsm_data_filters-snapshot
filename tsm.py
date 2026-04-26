from requests import get, post
from typing import List
from os.path import exists
from time import time
import json


def json_to_str_format(json_data: dict) -> str:
    res = ''
    for key in json_data:
        res += f"{key}: {json_data[key]}, "
    res = res.strip(', ')
    return res


def tsm_get_auth_credentials(api_key: str, client_id: str) -> dict:
    data = {
        "client_id": client_id,
        "grant_type": "api_token",
        "scope": "app:realm-api app:pricing-api",
        "token": api_key
    }
    response = post('https://auth.tradeskillmaster.com/oauth2/token', data=data)
    status_code = response.status_code
    result = {'status_code': status_code,
              'error_details': None
              }
    response = response.json()
    if status_code == 200:
        result.update(response)
    else:
        result['error_details'] = json_to_str_format(response)

    return result


def tsm_get_realms_all(access_token: str) -> dict:
    headers = {'authorization': f"Bearer {access_token}"}
    response = get('https://realm-api.tradeskillmaster.com/realms', headers=headers)
    status_code = response.status_code
    result = {'status_code': status_code,
              'error_details': None,
              'items': [],
              }
    response = response.json()
    if status_code == 200:
        result['items'] = response['items']
    else:
        result['error_details'] = json_to_str_format(response)
    return result


def tsm_get_regions_all(access_token: str) -> dict:
    headers = {'authorization': f"Bearer {access_token}"}
    response = get('https://realm-api.tradeskillmaster.com/regions', headers=headers)
    status_code = response.status_code
    result = {'status_code': status_code,
              'error_details': None
              }
    response = response.json()
    if status_code == 200:
        result.update(response)
    else:
        result['error_details'] = json_to_str_format(response)

    return result


def tsm_get_ah_info(access_token: str, ah_id: int) -> dict:
    headers = {'authorization': f"Bearer {access_token}"}
    response = get(f'https://realm-api.tradeskillmaster.com/auction-houses/{ah_id}', headers=headers)
    status_code = response.status_code
    result = {'status_code': status_code,
              'error_details': None
              }
    response = response.json()
    if status_code == 200:
        result.update(response)
    else:
        result['error_details'] = json_to_str_format(response)

    return result


def tsm_get_data_ah(access_token: str, ah_id: int, format_items: bool = True) -> dict:
    headers = {'authorization': f"Bearer {access_token}"}
    response = get(f'https://pricing-api.tradeskillmaster.com/ah/{ah_id}', headers=headers)
    status_code = response.status_code
    elapsed = response.elapsed.seconds
    result = {'status_code': status_code,
              'elapsed': elapsed,
              'error_details': None,
              'items': []
              }
    response = response.json()
    if status_code == 200:
        if format_items:
            result['items'] = tsm_format_data_ah(response)
        else:
            result['items'] = response
    else:
        result['error_details'] = json_to_str_format(response)
    return result


def tsm_get_data_region(access_token: str, region_id: int, format_items: bool = True) -> dict:
    headers = {'authorization': f"Bearer {access_token}"}
    response = get(f'https://pricing-api.tradeskillmaster.com/region/{region_id}', headers=headers)
    status_code = response.status_code
    elapsed = response.elapsed.seconds
    result = {'status_code': status_code,
              'elapsed': elapsed,
              'error_details': None,
              'items': []
              }
    response = response.json()
    if status_code == 200:
        if format_items:
            result['items'] = tsm_format_data_region(response)
        else:
            result['items'] = response
    else:
        result['error_details'] = json_to_str_format(response)
    return result


def tsm_format_data_ah(data_list: List) -> dict:
    # Reduce data size for faster loading, order of data in the list:
    # 0 - minBuyout
    # 1 - marketValue
    # 2 - historical price
    # 3 - numAuctions
    # 4 - quantity (Items Number)
    result = {}
    for item in data_list:
        item_id = item['itemId']
        if item_id:
            formatted_item = [item['minBuyout'], item['marketValue'],  item['historical'],
                              item['numAuctions'], item['quantity']
                              ]
            result[item_id] = formatted_item
    return result


def tsm_format_data_region(data_list: List) -> dict:
    # Reduce data size for faster loading, order of data in the list:
    # 0 - marketValue
    # 1 - historical price
    # 2 - avgSalePrice
    # 3 - soldPerDay
    # 4 - salePct (Sale Rate)
    # 5 - quantity (Items Number)
    result = {}
    for item in data_list:
        item_id = item['itemId']
        if item_id:
            formatted_item = [item['marketValue'],  item['historical'], item['avgSalePrice'], item['soldPerDay'],
                              item['salePct'], item['quantity']
                              ]
            result[item_id] = formatted_item
    return result


def format_realms(realms_list: list) -> dict:
    result = {
        'gameVersions': {},
        'gameVersionsList': [],
        'timestamp': None
    }

    game_versions_unsorted = set()
    regions_unsorted = []
    for region in realms_list:
        game_version = region['gameVersion']
        region_name = region['name']
        region_id = region['regionId']
        # Renaming game versions
        if game_version == 'Wrath':
            game_version = 'WotLK'
            region_name = region_name.replace('BCC', 'WotLK')
        elif game_version == 'Classic (SoM)':
            game_version = 'Classic (Season of Mastery)'
            region_name = region_name.replace('SoM', 'Season of Mastery')

        game_versions_unsorted.add(game_version)

        region_new = {
            'gameVersion': game_version,
            'regionId': region_id,
            'regionName': region_name,
            'realms': {},
            'realmsOrder': []
        }

        realms_unsorted = []
        for raw_realm in region['realms']:
            realm = {
                'realmId': raw_realm['realmId'],
                'locale': raw_realm['locale'],
                'localizedName': raw_realm['localizedName'],
                'auctionHouses': {},
                'auctionHousesOrder': []
            }
            auction_houses = raw_realm['auctionHouses']
            auction_houses_order = []
            for ah in auction_houses:
                ah_id = ah['auctionHouseId']
                ah_type = ah['type']
                realm['auctionHouses'][ah_id] = ah_type
                auction_houses_order.append(ah_id)
            auction_houses_order = sorted(auction_houses_order)
            realm['auctionHousesOrder'] = auction_houses_order
            realms_unsorted.append(realm)
        realms_sorted = sorted(realms_unsorted, key=lambda x: x['localizedName'])
        for realm in realms_sorted:
            realm_id = realm['realmId']
            realm.pop('realmId')
            region_new['realms'][realm_id] = realm
            region_new['realmsOrder'].append(realm_id)
        regions_unsorted.append(region_new)

    regions_sorted = sorted(regions_unsorted, key=lambda x: x['regionName'])
    for region in regions_sorted:
        game_version = region['gameVersion']
        region_id = region['regionId']
        region.pop('gameVersion')
        region.pop('regionId')
        if game_version in result['gameVersions']:
            result['gameVersions'][game_version]['regions'][region_id] = region
            result['gameVersions'][game_version]['regionsOrder'].append(region_id)
        else:
            result['gameVersions'][game_version] = {
                'regions': {region_id: region},
                'regionsOrder': [region_id]
            }

    game_versions_sorted = sorted(game_versions_unsorted)
    result['gameVersionsList'] = game_versions_sorted
    result['timestamp'] = time()
    return result


def load_cache(cache_path: str) -> dict or None:
    if exists(cache_path):
        with open(cache_path, 'r') as file:
            return json.load(file)
    else:
        return None


def save_cache(cache_path: str, cache_data: dict):
    with open(cache_path, 'w') as file:
        json.dump(cache_data, file)


def get_ah_items(access_token: str, ah_id: int, cache_expire_minutes, force_cache_update: bool,
                 disable_cache_update: bool) -> dict:
    result = {'data': None,
              'errors': []
              }
    ah_cache_path = f'cache_ah/{ah_id}.json'
    ah_cache_data = load_cache(ah_cache_path)

    # If cache exist and user prefer to disable update
    if ah_cache_data and ah_cache_data['items'] and disable_cache_update:
        result['data'] = ah_cache_data
        return result

    cache_min_timestamp_ah = time() - cache_expire_minutes * 60
    # If cache exists and its not expired and not forced to update by user
    if ah_cache_data and ah_cache_data['items'] and ah_cache_data['timestamp'] >= cache_min_timestamp_ah \
            and not force_cache_update:
        result['data'] = ah_cache_data
    else:
        try:
            tsm_ah_response = tsm_get_data_ah(access_token, ah_id, format_items=True)
            if tsm_ah_response['error_details']:
                error_details = tsm_ah_response['error_details']
                error_message = f"Can't get TSM data for AH id {ah_id} - status code {tsm_ah_response['status_code']}, " \
                                f"TSM API response details:<br>{error_details}"
                result['errors'].append(error_message)
            else:
                timestamp = time()
                ah_new_cache = {'id': ah_id,
                                'timestamp': timestamp,
                                'expires': timestamp + cache_expire_minutes * 60,
                                'elapsed': tsm_ah_response['elapsed'],
                                'items': tsm_ah_response['items']
                                }
                save_cache(ah_cache_path, ah_new_cache)
                result['data'] = ah_new_cache
        except Exception as e:
            result['errors'].append(f"Can't get TSM data for AH id {ah_id}: {e}")
    return result


def get_region_items(access_token: str, region_id: int, cache_expire_minutes: int,
                     force_cache_update: bool, disable_cache_update: bool) -> dict:
    result = {'data': None,
              'errors': [],
              }
    region_cache_path = f'cache_region/{region_id}.json'
    region_cache_data = load_cache(region_cache_path)

    # If cache exist and user prefer to disable update
    if region_cache_data and region_cache_data['items'] and disable_cache_update:
        result['data'] = region_cache_data
        return result

    cache_min_timestamp_region = time() - cache_expire_minutes * 60
    if region_cache_data and region_cache_data['items'] \
            and region_cache_data['timestamp'] >= cache_min_timestamp_region and not force_cache_update:
        result['data'] = region_cache_data
    else:
        try:
            tsm_region_response = tsm_get_data_region(access_token, region_id, format_items=True)
            if tsm_region_response['error_details']:
                error_details = tsm_region_response['error_details']
                error_message = f"Can't get TSM data for region id {region_id} - status code {tsm_region_response['status_code']}, " \
                                f"TSM API response details:<br>{error_details}"
                result['errors'].append(error_message)
            else:
                timestamp = time()
                region_new_cache = {'id': region_id,
                                    'timestamp': timestamp,
                                    'expires': timestamp + cache_expire_minutes * 60,
                                    'elapsed': tsm_region_response['elapsed'],
                                    'items': tsm_region_response['items']
                                    }
                save_cache(region_cache_path, region_new_cache)
                result['data'] = region_new_cache
        except Exception as e:
            result['errors'].append(f"Can't get TSM data for region id {region_id}: {e}")
    return result


def get_items(access_token: str, region_id: int, ah_id: int, cache_expire_minutes_region: int,
              cache_expire_minutes_ah: int, force_cache_update: bool = False,
              disable_cache_update: bool = False) -> dict:
    result = {'region': None,
              'ah': None,
              'errors': []
              }

    region_data = get_region_items(access_token, region_id, cache_expire_minutes_region, force_cache_update,
                                   disable_cache_update)
    result['region'] = region_data['data']
    result['errors'] += region_data['errors']

    ah_data = get_ah_items(access_token, ah_id, cache_expire_minutes_ah, force_cache_update, disable_cache_update)
    result['ah'] = ah_data['data']
    result['errors'] += ah_data['errors']
    return result
