#!/bin/sh
cd "$APP_DIR" && . venv/bin/activate && python update_realms_cron.py && touch .restart-app
