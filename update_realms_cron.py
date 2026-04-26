from tsm import tsm_get_auth_credentials, tsm_get_realms_all, format_realms, save_cache
from yaml import load, Loader, dump
from json import dumps
from time import time
from os import listdir, remove


"""
Cache updating logic:
- Download new realms data;
- Save new realms cache;
- Remove old cache;
- Updating config.yml with new file name;
- Restart app by shell script to apply new cache file;
"""

with open("config.yml", "r") as yaml_file:
    config = load(yaml_file, Loader)

api_key_updater = config['api_key_updater']
tsm_client_id = config['tsm_client_id']
cache_dir = 'static/cache/'

auth_response = tsm_get_auth_credentials(api_key_updater, tsm_client_id)
if 'access_token' not in auth_response:
    print(f"Auth failed: {auth_response.get('errors', 'unknown error')}")
    raise SystemExit(1)
access_token = auth_response['access_token']
realms_response = tsm_get_realms_all(access_token)
realms_cache = format_realms(realms_response['items'])
realms_json = dumps(realms_cache)
realms_js = "var realms_json = " + realms_json
new_cache_name = f'realms{int(time())}.js'

# Save new cache
with open(cache_dir + new_cache_name, 'w+') as file:
    file.write(realms_js)

# Removing old files
cache_files = listdir(cache_dir)
for file in cache_files:
    if file != new_cache_name:
        remove(cache_dir + file)

# Updating config
config['realms_cache_file'] = cache_dir + new_cache_name
with open("config.yml", "w") as yaml_file:
    dump(config, yaml_file)
