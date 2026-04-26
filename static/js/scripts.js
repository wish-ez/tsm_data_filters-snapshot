var api_key_id = "apiKey";
var api_key_input = "input#" + api_key_id

var versions_id = "gameVersions";
var versions_selector = "select#" + versions_id;

var regions_id = "regions";
var regions_selector = "select#" + regions_id;
var regions_options = regions_selector + " option";

var realms_id = "realms";
var realms_selector = "select#" + realms_id;
var realms_options =  realms_selector + " option";

var factions_id = "factions";
var factions_selector = "select#" + factions_id;
var factions_options = factions_selector + " option";

var settings_remember_id = "settingsRemember";
var settings_remember_checkbox = "input#" + settings_remember_id;
var force_data_update_id = "forceDataUpdate";
var force_data_update_checkbox = "input#" + force_data_update_id;
var disable_data_update_id = "disableDataUpdate";
var disable_data_update_checkbox = "input#" + disable_data_update_id;


var reset_settings_button = "button#resetSettings";
var reset_filters_button = "button#resetFilters";

var search_button = "button#searchButton";

var cookie_params = {expires: 365, sameSite: 'strict'};
var cookies_loaded = false;

var cache = {};
var num_items_realm = {};
var num_items_region = {};

var current_region_name = null;
var current_realm_name = null;
var current_faction_name = null;

var current_search = null;

var wh_language_code = null;
var wh_game_version = null;
var wh_loaded_items = new Set();

// For filter logic
var available_filters = [
    { name: 'realmBuyout', type: 'money', scale: 'realm' }, { name: 'realmMarket', type: 'money', scale: 'realm' },
    { name: 'realmHistorical', type: 'money', scale: 'realm' }, { name: 'regionMarket', type: 'money', scale: 'region' },
    { name: 'regionHistorical', type: 'money', scale: 'region'}, { name: 'regionAvgSale', type: 'money', scale: 'region' },
    { name: 'realmNumAuctions', type: 'numeric', scale: 'realm' }, { name: 'realmNumItems', type: 'numeric', scale: 'realm' },
    { name: 'regionDailySold', type: 'numeric', scale: 'region' }, { name: 'regionSaleRate', type: 'numeric', scale: 'region' },
    { name: 'regionNumItems', type: 'numeric', scale: 'region' }
]
var chosen_filters = [];
var applied_filters = [];
var is_region_filters_disabled = false; // To handle empty realms data;
var is_realm_filters_disabled = false; // To handle empty region data;
var filtered_items = [];


function clear_selectors(selectors) {
    selectors.forEach(function(item) {
        $(item).val(null).change();
    })
}

function disable_selectors(selectors) {
    selectors.forEach(function(item) {
        $(item).prop('disabled', true);
    })
}

function reset_selectors_and_cookies_values(selectors) {
    selectors.forEach(function(selector) {
        $(selector).empty();
        $(selector).prop('disabled', true);
        // If cookies already loaded (page init passed) - not only selector values will be reset but also cookies
        // To keep empty values on manual selectors changing
        if (cookies_loaded) {
            let selector_id = $(selector).prop("id");
            Cookies.remove(selector_id);
        }
    })
}

function enable_filters() {
    $('.tsm-filters input').each(function(){
        $(this).prop('disabled', false);
    });
    $('.tsm-clear-button').each(function(){
        $(this).prop('disabled', false);
        $(this).parent().parent().removeClass("disabled");
    })
    $("#searchButton").prop("disabled", false);
    $("#resetFilters").prop("disabled", false);
}

function disable_filters() {
    $('.tsm-filters input').each(function(){
        $(this).prop('disabled', true);
    });
    $('.tsm-clear-button').each(function(){
        $(this).prop('disabled', true);
        $(this).parent().parent().addClass("disabled");
    })
    $("#searchButton").prop("disabled", true);
    $("#resetFilters").prop("disabled", true);
}

function enable_selectors(selectors) {
    selectors.forEach(function(item) {
        $(item).prop('disabled', false);
    })
}

function hide_option(option) {
    $(option).hide();
    $(option).attr('disabled', 'disabled');
    $(option).attr('hidden', "");
}

function show_option(option) {
    $(option).show();
    $(option).removeAttr('disabled');
    $(option).removeAttr('hidden');
}

function show_clear_button(clear_button_selector) {
    $(clear_button_selector).toggleClass("invisible", false);
}

function update_button_content(button_selector, default_html, new_html, fade_speed, timeout) {
    let button = $(button_selector);
    if (!default_html) {
        $(button).fadeOut(fade_speed, function() {
            $(button).html(new_html);
            $(button).fadeIn(fade_speed);
        });
    }
    else {
        $(button).fadeOut(fade_speed, function() {
            $(button).html(new_html);
            $(button).fadeIn(fade_speed, function() {
                setTimeout(function() {
                        $(button).fadeOut(fade_speed, function(){
                            $(button).html(default_html);
                            $(button).fadeIn(fade_speed);
                        })
                    }, timeout
                );
            });
        });
    }
}

function hide_clear_button_on_empty_filters(clear_button_selector) {
    let filters = $(clear_button_selector).parent().parent().find('input');
    let hide = true;
    $(filters).each(function() {
        if ($(this).val()) {
            hide = false;
            return false;
        }
    });
    if (hide == true) {
        $(clear_button_selector).toggleClass("invisible", true);
    }
}

function show_reset_button(clear_button_selector) {
    $(reset_filters_button).toggleClass("invisible", false);
}

function hide_reset_button(clear_button_selector) {
    $(reset_filters_button).toggleClass("invisible", true);
}

function hide_reset_button_on_empty_inputs() {
    /* If there no settings with values - hiding reset button */
    if ($(".tsm-clear-button:not(.invisible)").length == 0) {
        $(reset_filters_button).toggleClass("invisible", true);
    }
}

function reset_factions() {
    show_option("option#factionAlliance");
    show_option("option#factionHorde");
    show_option("option#factionAll");
    $("option#factionAlliance").val(null);
    $("option#factionHorde").val(null);
    $("option#factionAll").val(null);
    current_faction_name = null;
}

function gameVersionsChanged(e) {
    reset_selectors_and_cookies_values([regions_selector, realms_selector, factions_selector]);
    enable_selectors([regions_selector]);
    disable_filters();
    let selected_game_version = e.value;
    if (selected_game_version) {
        $(versions_selector + ' option[value=""]').first().remove();
        let available_regions_ids = realms_json['gameVersions'][selected_game_version]['regionsOrder'];
        let available_regions = realms_json['gameVersions'][selected_game_version]['regions'];
        $(regions_selector)[0].innerHTML +="<option selected value=''></option>";
        for (region_id of available_regions_ids) {
            let region_name = available_regions[region_id]['regionName']
            let new_option = "<option value='" + region_id + "'>" + region_name + "</option>"
            $(regions_selector)[0].innerHTML += new_option;
        }
        $(reset_settings_button).toggleClass("invisible", false);
    }
    else {
        disable_selectors([regions_selector]);
        $(reset_settings_button).toggleClass("invisible", true);
    }
}

function gameVersionsSet(selected_game_version) {
    if (selected_game_version) {
        $(versions_selector).val(selected_game_version).change();
    }
}

function regionsChanged(e) {
    reset_selectors_and_cookies_values([realms_selector, factions_selector]);
    enable_selectors([realms_selector]);
    disable_filters();
    let selected_game_version = $(versions_selector).val();
    let selected_region_id = e.value;
    if (selected_region_id) {
        $(regions_selector + ' option[value=""]').first().remove();
        current_region_name = $(regions_selector + " option:selected").text().trim();
        let available_realms_ids = realms_json['gameVersions'][selected_game_version]['regions'][selected_region_id]['realmsOrder'];
        let available_realms = realms_json['gameVersions'][selected_game_version]['regions'][selected_region_id]['realms'];
        $(realms_selector)[0].innerHTML += "<option selected value=''></option>";
        for (realm_id of available_realms_ids) {
            let realm_name = available_realms[realm_id]['localizedName']
            let locale = available_realms[realm_id]['locale']
            let new_option = "<option data-locale='" + locale + "' value='" + realm_id + "'>" + realm_name + " (" + locale + ")</option>"
            $(realms_selector)[0].innerHTML += new_option;
        }
        $(reset_settings_button).toggleClass("invisible", false);
    }
    else {
        current_region_name = null;
        disable_selectors([realms_selector])
    }
}

function regionsSet(selected_region_id) {
    if (selected_region_id) {
        $(regions_selector).val(selected_region_id).change();
    }
}

function realmsChanged(e) {
    reset_selectors_and_cookies_values([factions_selector]);
    enable_selectors([factions_selector]);
    disable_filters();
    let selected_game_version = $(versions_selector).val();
    let selected_region_id = $(regions_selector).val();
    let selected_realm_id = e.value;
    $(realms_selector + ' option[value=""]').first().remove();
    current_realm_name = $(realms_selector + " option:selected").text().trim();
    let available_factions_ids = realms_json['gameVersions'][selected_game_version]['regions'][selected_region_id]['realms'][selected_realm_id]['auctionHousesOrder']
    let available_factions = realms_json['gameVersions'][selected_game_version]['regions'][selected_region_id]['realms'][selected_realm_id]['auctionHouses']
    // If only 'All' factions option available - select it now
    if (available_factions_ids.length == 1) {
        $(factions_selector + ' option[value=""]').first().remove();
        let entries = Object.entries(available_factions)[0]
        let ah_id = entries[0]
        let faction_name = entries[1]
        let selected_faction = "<option selected value='" + ah_id + "'>" + faction_name + "</option>"
        $(factions_selector)[0].innerHTML += selected_faction;
        if (is_all_settings_filled()) {
            enable_filters();
        }
        current_faction_name = faction_name;
    }
    else {
        $(factions_selector)[0].innerHTML += "<option selected value=''></option>";
        for (ah_id of available_factions_ids) {
            let faction_name = available_factions[ah_id];
            let new_faction = "<option value='" + ah_id + "'>" + faction_name + "</option>"
            $(factions_selector)[0].innerHTML += new_faction;
        }
    }
    let chosen_items_locale = Cookies.get('itemsLocale');
    if (chosen_items_locale) {
        wh_language_code = chosen_items_locale;
    }
    else {
        let locale = $(realms_selector + " option:selected").data('locale');
        let language_code = locale.split('_')[0];
        if (language_code == 'zh') {
            wh_language_code = 'cn';
        }
        else {
            wh_language_code = language_code
        }
        // Setup default locale option in 'Items locale' dropdown menu
        $("input.table-locale-toggle[value='"+ wh_language_code +"']").prop('checked', true);
    }

    let game_version_full = $(versions_selector + " option:selected").text().trim();
    if (game_version_full) {
        switch (game_version_full) {
            case 'Classic (Season of Mastery)':
                wh_game_version = 'classic/';
                break
            case 'Classic':
                wh_game_version = 'classic/';
                break
            case 'WotLK':
                wh_game_version = 'wotlk/';
                break
            default:
                wh_game_version = '';
        }
    }
}

function realmsSet(selected_realm_id) {
    $(realms_selector).val(selected_realm_id).change();
}

function factionsChanged(e) {
    $(factions_selector + ' option[value=""]').first().remove();
    current_faction_name = $(factions_selector + " option:selected").text().trim();
    if (is_all_settings_filled()) {
        enable_filters();
    }
}

function factionsSet(faction_id) {
    $(factions_selector).val(faction_id).change();
}

function init_tsm_inputs() {
    /* Showing or hiding clear buttons on value change, saving value in cookies */
    $(".tsm-input").on("input", function() {
        let clear_button_id = '#' + $(this).attr("clear_button");
        let value = this.value;
        let filter_name = this.id;
        if (this.value) {
            let parsed_value = parseInt(this.value);
            if (!parsed_value) {
                this.value = null;
                Cookies.remove(filter_name);
                return;
            }
            else {
                this.value = parsed_value;
                show_reset_button();
                show_clear_button(clear_button_id);
                Cookies.set(filter_name, value, cookie_params);
            }
        }
        else {
            hide_clear_button_on_empty_filters(clear_button_id);
            Cookies.remove(filter_name);
        }
        hide_reset_button_on_empty_inputs();
    });

    /* Moving the caret to the next input on 'Enter' */
    $(".tsm-input").on("keypress", function(e){
        if (e.which == 13) {
            let all_tsm_filters = $('.tsm-filters input');
            let next_filter_index = all_tsm_filters.index(this) + 1;
            let next_filter = all_tsm_filters[next_filter_index]
            if (next_filter) {
                next_filter.focus();
            }
        }
    });

    /* Increment and decrement on arrows */
    $(".tsm-input").on("keydown", function(e){
        // Arrow up
        if (e.which == 38) {
            let value = parseInt($(this).val());
            if (value) {
                $(this).val(value + 1).trigger('input');
            }
            else {
                $(this).val(1).trigger('input');
            }
        }
        // Arrow down
        else if (e.which == 40) {
            let value = parseInt($(this).val());
            if (value && value > 1) {
                $(this).val(value - 1).trigger('input');
            }
            else {
                $(this).val('').trigger('input');
            }
        }
    });
}


function init_tsm_input_sale_rate() {
    $(".tsm-input-sale-rate").on("input", function(event) {
        let clear_button_id = '#' + $(this).attr("clear_button");
        let value = this.value;
        let filter_name = this.id;
        if (value) {
            value = value.replace(/[^\d.]|\.(?=.*\.)/g, "");
            this.value = value;
            if (!value) {
                Cookies.remove(filter_name);
                return
            }
            else {
                if (parseFloat(value) > 1) {
                    this.value = '1.000'
                }
                else {
                    this.value = value;
                }
                show_clear_button(clear_button_id);
                show_reset_button();
                Cookies.set(filter_name, value, cookie_params);
            }
        }
        else {
            hide_clear_button_on_empty_filters(clear_button_id);
            Cookies.remove(filter_name);
        }
        hide_reset_button_on_empty_inputs();
    });

    /* Moving the caret to the next input on 'Enter' */
    $(".tsm-input-sale-rate").on("keypress", function(e){
        if (e.which == 13) {
            let all_tsm_filters = $('.tsm-filters input');
            let next_filter_index = all_tsm_filters.index(this) + 1;
            let next_filter = all_tsm_filters[next_filter_index]
            if (next_filter) {
                next_filter.focus();
            }
        }
    });

    /* Increment and decrement on arrows */
    $(".tsm-input-sale-rate").on("keydown", function(e){
        let increment_value = 0.01;
        let value_str = this.value;
        let key_code = e.which;
        if (key_code == 38) {
            if (value_str) {
                let value_float = parseFloat(value_str);
                value_float = (value_float + increment_value).toFixed(3);
                $(this).val(value_float).trigger('input');
            }
            else {
                $(this).val(increment_value).trigger('input');
            }
        }
        else if (key_code == 40) {
            let value_float = parseFloat(value_str);
            if (value_float && value_float > increment_value) {
                value_float = (value_float - increment_value).toFixed(3);
                $(this).val(value_float).trigger('input');
            }
            else {
                $(this).val('').trigger('input');
            }
        }
    });
}

function init_tsm_input_daily_sold() {
    $(".tsm-input-daily-sold").on("input", function(event) {
        let clear_button_id = '#' + $(this).attr("clear_button");
        let value = this.value;
        let filter_name = this.id;
        if (value) {
            value = value.replace(/[^\d.]|\.(?=.*\.)/g, "");
            this.value = value;
            if (!value) {
                Cookies.remove(filter_name);
                return
            }
            else {
                if (parseFloat(value) > 999999.999) {
                    this.value = '999999.999'
                }
                else {
                    this.value = value;
                }
                show_clear_button(clear_button_id);
                show_reset_button();
                Cookies.set(filter_name, value, cookie_params);
            }
        }
        else {
            hide_clear_button_on_empty_filters(clear_button_id);
            Cookies.remove(filter_name);
        }
        hide_reset_button_on_empty_inputs();
    });

    /* Moving the caret to the next input on 'Enter' */
    $(".tsm-input-daily-sold").on("keypress", function(e){
        if (e.which == 13) {
            let all_tsm_filters = $('.tsm-filters input');
            let next_filter_index = all_tsm_filters.index(this) + 1;
            let next_filter = all_tsm_filters[next_filter_index]
            if (next_filter) {
                next_filter.focus();
            }
        }
    });

    /* Increment and decrement on arrows */
    $(".tsm-input-daily-sold").on("keydown", function(e){
        let increment_value = 1;
        let value_str = this.value;
        let key_code = e.which;
        if (key_code == 38) {
            if (value_str) {
                let value_float = parseFloat(value_str);
                value_float = (value_float + increment_value).toFixed(3);
                $(this).val(value_float).trigger('input');
            }
            else {
                $(this).val(increment_value).trigger('input');
            }
        }
        else if (key_code == 40) {
            let value_float = parseFloat(value_str);
            if (value_float && value_float > increment_value) {
                value_float = (value_float - increment_value).toFixed(3);
                $(this).val(value_float).trigger('input');
            }
            else {
                $(this).val('').trigger('input');
            }
        }
    });
}

function init_clear_buttons() {
    /* Setup clear buttons logic */
    $(".tsm-clear-button").on("click", function(){
        $(this).toggleClass("invisible", true);
        let inputs_row = this.parentNode.parentNode;
        $(inputs_row).find("input").each(function(){
            this.value = null
            let filter_name = this.id;
            Cookies.remove(filter_name);
        });
        hide_reset_button_on_empty_inputs();
    })

    /* Reset settings button logic */
    $(reset_settings_button).on("click", function() {
        $(this).toggleClass('invisible', true);
        clear_selectors([versions_selector, regions_selector, realms_selector, factions_selector]);
        disable_selectors([regions_selector, realms_selector, factions_selector]);
        $(force_data_update_checkbox).prop("checked", false).change();
        $(disable_data_update_checkbox).prop("checked", false).change();
    });

    /* Reset filters button logic */
    $(reset_filters_button).on("click", function() {
        $(".tsm-input-sale-rate, .tsm-input-daily-sold").each(function() {
            this.value = null;
            let clear_button_id = '#' + $(this).attr("clear_button");
            hide_clear_button_on_empty_filters(clear_button_id);
            let filter_name = this.id;
            Cookies.remove(filter_name);
        });
        $(this).toggleClass("invisible", true);
    });
}

function copper_to_money(copper_initial) {
    let gold = Math.floor(copper_initial / 10000);
    let silver = Math.floor((copper_initial - gold * 10000) / 100)
    let copper = copper_initial - gold * 10000 - silver * 100
    result = {
        gold: gold,
        silver: silver,
        copper: copper
    }
    return result
}

function copper_to_money_span(copper) {
    let money = copper_to_money(copper);
    let value = '';

    if (money.gold) {
        let gold_localized = money.gold.toLocaleString();
        value += '<span class="gold-value">' + gold_localized + '<span class="gold">g </span></span>';
    }
    if (money.silver) {
        value += '<span class="silver-value">' + money.silver + '<span class="silver">s </span></span>';
    }
    if (money.copper) {
        value += '<span class="copper-value">' + money.copper + '<span class="copper">c</span></span>';
    }
    return value
}

function money_to_copper(gold, silver, copper) {
    return gold * 10000 + silver * 100 + copper;
}

function load_wowhead_data(event) {
    let item_id = event.target.parentNode.parentNode.parentNode.dataset.uniqueid;
    let wh_tooltip = $(".wowhead-tooltip:visible").first();
    if (!wh_loaded_items.has(item_id) && wh_tooltip.length > 0) {
        wh_loaded_items.add(item_id);
        let link = event.target;
        $(link).unbind("mousemove", load_wowhead_data);
        let wh_item = $(wh_tooltip).find("b");
        let wh_item_name = $(wh_item).first().text();
        let wh_item_color = $(wh_item).css("color");
        let wh_icon_large_url = $(wh_tooltip).find(".whtt-tooltip-icon").find("ins").css("background-image");
        wh_icon_large_url = wh_icon_large_url.replace('url("', '').replace('")', '')
        let wh_icon_small_url = wh_icon_large_url.replace("/medium/", "/small/");
        let item_values = {
        'id': item_id,
        'name': wh_item_name,
        'icon': wh_icon_small_url,
        'quality_color': wh_item_color
        }

        $("#table").bootstrapTable('updateCellByUniqueId', {id: item_id, field: 'item', value: item_values});
    }
}

function init_units_button() {
    $("input.table-unit-toggle").each(function(){
        // Removing unnecessary event handlers from bootstrap-table package
        $(this).off("click");

        $(this).on("click", function(){
            let unit = this.value;
            let table_class_modifier = unit + "-disabled";
            let is_unit_enabled = this.checked;
            if (is_unit_enabled) {
                // If unit enabled - removing table class which hides such unit
                $("#table").removeClass(table_class_modifier);
                Cookies.remove(unit + "Disabled");
            }
            else {
                // Otherwise - adding class to hide unit;
                $("#table").addClass(table_class_modifier);
                Cookies.set(unit + "Disabled", "true");
            }
        })
        // Checking disabled units in cookies, if disabled - clicking and firing function above
        let disable_unit_cookie = Cookies.get(this.value + "Disabled");
        if (disable_unit_cookie == "true") {
            $(this).click();
        }
    });
}

function init_items_locale_button() {
    let preferred_items_locale = Cookies.get("itemsLocale") || wh_language_code;
    $("input.table-locale-toggle").each(function(){
        // Removing unnecessary event handlers from bootstrap-table package
        $(this).off("click");

        $(this).on("click", function(){
            let items_locale = this.value;
            wh_language_code = items_locale;
            Cookies.set("itemsLocale", items_locale);
            wh_loaded_items.clear();
            $("#table").bootstrapTable('load', filtered_items);
        });

        // If such locale presented in cookies - click it
        if (preferred_items_locale == this.value) {
            $(this).prop("checked", true);
        }
    });
}

function init_table() {
    function buttons () {
        return {
            btnCopy: {
                text: '<span>Copy items to clipboard <i class="bi bi-clipboard"></i></span>',
                event: function () {
                    let copy_button_selector = "#itemsCopyButton span";
                    let selected_items = $("#table").bootstrapTable('getSelections');
                    let num_items_total = $("#table").bootstrapTable('getData').length;
                    let num_items_selected = selected_items.length;
                    let num_items_excluded = num_items_total - num_items_selected;
                    let button_text = '';
                    if (num_items_selected > 0) {
                        let tsm_string = '';
                        selected_items.forEach(function(item) {
                            tsm_string += 'i:' + item.itemId + ';';
                        });
                        navigator.clipboard.writeText(tsm_string);
                        button_text = 'Successfully copied ' + num_items_selected + ' items <i class="bi bi-clipboard-check"></i>';
                        if (num_items_excluded > 0) {
                            button_text = button_text + ' (' + num_items_excluded + ' excluded)';
                        }
                    }
                    else {
                        button_text = '<i class="bi bi-exclamation-triangle red"></i> Warning! No items selected - nothing to copy <i class="bi bi-exclamation-triangle red"></i>';
                    }
                    let default_button_text = $(copy_button_selector).html();
                    update_button_content(copy_button_selector, default_button_text, button_text, 200, 2000);
                },
                attributes: {
                    title: 'Copying selected items in TSM format to the clipboard for import in the game',
                    id: 'itemsCopyButton',
                },
            },
            btnLocale: {
                html: '<div class="keep-open btn-group">' +
                '<button class="btn btn-secondary dropdown-toggle" type="button" id="itemsLocaleButton" data-bs-toggle="dropdown" aria-label="Select items labels language" title="Items locale">' +
                '<i class="bi bi-translate"></i> Items locale</button>' +
                    '<div class="dropdown-menu" id="dropdownLocales" aria-labelledby="itemsLocaleButton">' +
                        '<label class="dropdown-item dropdown-item-marker">' +
                            '<input type="radio" name="itemsLocale" value="en" class="table-locale-toggle"><span> English</span>' +
                        '</label>' +
                        '<label class="dropdown-item dropdown-item-marker">' +
                            '<input type="radio" name="itemsLocale" value="de" class="table-locale-toggle"><span> Deutsch</span>' +
                        '</label>' +
                        '<label class="dropdown-item dropdown-item-marker">' +
                            '<input type="radio" name="itemsLocale" value="ru" class="table-locale-toggle"><span> Русский</span>' +
                        '</label>' +
                        '<label class="dropdown-item dropdown-item-marker">' +
                            '<input type="radio" name="itemsLocale" value="fr" class="table-locale-toggle"><span> Français</span>' +
                        '</label>' +
                        '<label class="dropdown-item dropdown-item-marker">' +
                            '<input type="radio" name="itemsLocale" value="es" class="table-locale-toggle"><span> Español</span>' +
                        '</label>' +
                        '<label class="dropdown-item dropdown-item-marker">' +
                            '<input type="radio" name="itemsLocale" value="it" class="table-locale-toggle"><span> Italiano</span>' +
                        '</label>' +
                        '<label class="dropdown-item dropdown-item-marker">' +
                            '<input type="radio" name="itemsLocale" value="pt" class="table-locale-toggle"><span> Português Brasileiro</span>' +
                        '</label>' +
                        '<label class="dropdown-item dropdown-item-marker">' +
                            '<input type="radio" name="itemsLocale" value="ko" class="table-locale-toggle"><span> 한국어</span>' +
                        '</label>' +
                        '<label class="dropdown-item dropdown-item-marker">' +
                            '<input type="radio" name="itemsLocale" value="cn" class="table-locale-toggle"><span> 简体中文</span>' +
                        '</label>' +
                    '</div>' +
                '</div>'
            },
            btnUnits: {
                html: '<div class="keep-open btn-group">' +
                '<button class="btn btn-secondary dropdown-toggle" type="button" id="moneyUnitsButton" data-bs-toggle="dropdown" aria-label="Select units to display" title="Units">' +
                '<i class="bi bi-coin"></i> Units</button>' +
                    '<div class="dropdown-menu" id="dropdownUnits" aria-labelledby="moneyUnitsButton">' +
                        '<label class="dropdown-item dropdown-item-marker">' +
                            '<input type="checkbox" value="gold" class="table-unit-toggle" checked><span class="gold"> Gold</span>' +
                        '</label>' +
                        '<label class="dropdown-item dropdown-item-marker">' +
                            '<input type="checkbox" value="silver" class="table-unit-toggle" checked><span class="silver"> Silver</span>' +
                        '</label>' +
                        '<label class="dropdown-item dropdown-item-marker">' +
                            '<input type="checkbox" value="copper" class="table-unit-toggle" checked><span class="copper"> Copper</span>' +
                        '</label>' +
                    '</div>' +
                '</div>'
            },
        }
    }
    let columns = [
        {
            field: 'checkbox',
            title: 'Include',
            class: 'item-include',
            checkbox: true,
            sortable: true,
            valign: 'middle',
        },
        {
            field: 'itemId',
            title: 'ID',
            sortable: true,
            valign: 'middle',
        },
        {
            field: 'item',
            title: 'Item',
            sortable: false,
            valign: 'middle',
            width: 250,
            formatter: function (val) {
                let item_id = val.id;
                let item_name = val.name || val.id;
                let item_icon = val.icon || "/static/icons/unknown_item.jpg";
                let item_quality_color = val.quality_color || "#0d6efd";
                let language_path = ''
                if (wh_language_code != 'en') {
                    language_path = wh_language_code + '/'
                }
                return "<div class=\x22item\x22><span class=\x22item-icon\x22 style=\x22background-image:url(\x27" + item_icon + "\x27)\x22></span><a class=\x22item-link\x22 style=\x22color:" + item_quality_color + "\x22 target=\x22_blank\x22 href=\x22https://www.wowhead.com/" + wh_game_version + language_path + "item=" + item_id + "\x22>[" + item_name + "]</a></div>"
            }
        },
        {
            field: 'realmBuyout',
            title: 'Realm Min Buyout' + $("#realmBuyoutTooltip")[0].outerHTML,
            sortable: true,
            valign: 'middle',
            formatter: function (copper) {
                let money_span = copper_to_money_span(copper) || '-';
                return '<div>' + money_span + '</div>';
            }
        },
        {
            field: 'realmMarket',
            title: 'Realm Market Value' + $("#realmMarketTooltip")[0].outerHTML,
            sortable: true,
            valign: 'middle',
            formatter: function (copper) {
                let money_span = copper_to_money_span(copper) || '-';
                return '<div>' + money_span + '</div>';
            }
        },
        {
            field: 'realmHistorical',
            title: 'Realm Historical Price' + $("#realmHistoricalTooltip")[0].outerHTML,
            sortable: true,
            valign: 'middle',
            formatter: function (copper) {
                let money_span = copper_to_money_span(copper) || '-';
                return '<div>' + money_span + '</div>';
            }
        },
        {
            field: 'realmNumAuctions',
            title: 'Realm Auctions Number' + $("#realmNumAuctionsTooltip")[0].outerHTML,
            sortable: true,
            valign: 'middle',
        },
        {
            field: 'realmNumItems',
            title: 'Realm Items Number' + $("#realmNumItemsTooltip")[0].outerHTML,
            sortable: true,
            valign: 'middle',
        },
        {
            field: 'regionMarket',
            title: 'Region Market Value' + $("#regionMarketTooltip")[0].outerHTML,
            sortable: true,
            valign: 'middle',
            formatter: function (copper) {
                let money_span = copper_to_money_span(copper) || '-';
                return '<div>' + money_span + '</div>';
            }
        },
        {
            field: 'regionHistorical',
            title: 'Region Historical Price' + $("#regionHistoricalTooltip")[0].outerHTML,
            sortable: true,
            valign: 'middle',
            formatter: function (copper) {
                let money_span = copper_to_money_span(copper) || '-';
                return '<div>' + money_span + '</div>';
            }
        },
        {
            field: 'regionAvgSale',
            title: 'Region Average Price' + $("#regionAvgSaleTooltip")[0].outerHTML,
            sortable: true,
            valign: 'middle',
            formatter: function (copper) {
                let money_span = copper_to_money_span(copper) || '-';
                return '<div>' + money_span + '</div>';
            }
        },
        {
            field: 'regionDailySold',
            title: 'Region Daily Sold' + $("#regionDailySoldTooltip")[0].outerHTML,
            sortable: true,
            valign: 'middle',
        },
        {
            field: 'regionSaleRate',
            title: 'Region Sale Rate' + $("#regionSaleRateTooltip")[0].outerHTML,
            sortable: true,
            valign: 'middle',
        },
        {
            field: 'regionNumItems',
            title: 'Region Items Number' + $("#regionNumItemsTooltip")[0].outerHTML,
            sortable: true,
            valign: 'middle'
        },
    ]

    let icons = {
        'columns': 'bi-layout-three-columns'
    }

    let options = {
        columns: columns,
        buttons: buttons,
        icons: icons,
        buttonsOrder: ['btnCopy', 'btnLocale', 'btnUnits'],
        data: [],
        formatNoMatches: function(){
            return "There are no items matching the selected filters"
        },
        clickToSelect: false,
        maintainMetaData: true,
        uniqueId: "itemId",
        pagination: true,
        paginationLoop: false,
        paginationParts: ["pageSize", "pageList"],
        pageList: "[10, 25, 50, 100, 200, All]",
        search: false,
        showButtonText: true,
        sorting: true,
        showColumns: true,
        showToggle: false,
        stickyHeader: true,
        onPostBody: function() {
            $("#table a").on("mousemove", load_wowhead_data);
            init_tooltips();
        },
    }
    $("#table").bootstrapTable(options);
    // Units button should be initialised only once
    init_units_button();
    init_items_locale_button();
}

function update_table(active_filters, data) {
    let options = $("#table").bootstrapTable('getOptions');
    let columns = options.columns[0];

    // If there any data
    if (data.length > 0) {
        // If there at least 1 active filter - hiding inactive (by default they all visible);
        if (active_filters.length > 0) {
            columns.forEach(function(column){
                // If it is default column or filter applied - show such column
                let field = column.field;
                if (field == 'checkbox' || field == 'itemId' || field == 'item' || active_filters.includes(field)) {
                    $("#table").bootstrapTable('showColumn', field);
                }
                else {
                    $("#table").bootstrapTable('hideColumn', field);
                }
            });
        }
        // Otherwise - showing all columns
        else {
            columns.forEach(function(column){
                $("#table").bootstrapTable('showColumn', column.field);
            });
        }
    }
    // If there no data - hide all columns ('hideAllColumns' method doesn't work for ID and NAME fields);
    else {
        columns.forEach(function(column){
            let field = column.field;
            $("#table").bootstrapTable('hideColumn', field);
        });
    }
    // Loading fresh data (old removes);
    $("#table").bootstrapTable('load', data);
}

function timestamp_to_relative_time(first_timestamp, seconds_timestamp, just_now_eq = 5, units = 3) {
    let difference = Math.floor(first_timestamp - seconds_timestamp);
    if (difference <= just_now_eq) {
        return;
    }
    difference = Math.abs(difference);
    let seconds_minutes = 60;
    let seconds_hours = seconds_minutes * 60;
    let seconds_days = seconds_hours * 24;
    let days = 0;
    let hours = 0;
    let minutes = 0;
    let result = [];

    if (difference >= seconds_days) {
        days = Math.floor(difference / seconds_days);
        if (days > 1) {
            result.push(days + ' days, ');
        }
        else if (days == 1) {
            result.push(days + ' day, ');
        }
    }

    let seconds_for_hours = difference - days * seconds_days;
    if (seconds_for_hours >= seconds_hours) {
        hours = Math.floor(seconds_for_hours / seconds_hours);
        if (hours > 1) {
            result.push(hours + ' hours, ');
        }
        else if (hours == 1) {
            result.push(hours + ' hour, ');
        }
    }

    let seconds_for_minutes = difference - days * seconds_days - hours * seconds_hours;
    if (seconds_for_minutes >= seconds_minutes) {
        minutes = Math.floor(seconds_for_minutes / seconds_minutes);
        if (minutes > 1) {
            result.push(minutes + ' minutes, ');
        }
        else if (minutes == 1) {
            result.push(minutes + ' minute, ');
        }
    }

    let seconds = difference - days * seconds_days - hours * seconds_hours - minutes * seconds_minutes;
    if (seconds > 1) {
        result.push(seconds + ' seconds, ');
    }
    else if (seconds == 1) {
        result.push(seconds + ' second, ');
    }

    result = result.slice(0, units - 1);
    result = result.join();
    result = result.slice(0, -2); // Removing last comma and space
    return result;
}

function filter_tsm_items(ah_id, region_id) {
    var filters_conditions = {};
    filtered_items = [];
    applied_filters = [];
    is_realm_filters_disabled = false;
    is_region_filters_disabled = false;

    // Preparing filters and conditions
    available_filters.forEach(function(filter){
        let filter_name = filter.name;
        let filter_type = filter.type;
        let filter_scale = filter.scale;
        switch (filter_type) {
            case 'money':
                let gold_min = Number($("#" + filter_name + "GoldMin").val());
                let silver_min = Number($("#" + filter_name + "SilverMin").val());
                let copper_min = Number($("#" + filter_name + "CopperMin").val());
                if (gold_min || silver_min || copper_min) {
                    var total_min = money_to_copper(gold_min, silver_min, copper_min);
                }
                else {
                    var total_min = null;
                }

                let gold_max = Number($("#" + filter_name + "GoldMax").val());
                let silver_max = Number($("#" + filter_name + "SilverMax").val());
                let copper_max = Number($("#" + filter_name + "CopperMax").val());
                if (gold_max || silver_max || copper_max) {
                    var total_max = money_to_copper(gold_max, silver_max, copper_max);
                }
                else {
                    var total_max = null;
                }
                // If there is no values at all - skip;
                if (!total_min && !total_max) {
                    return;
                }
                else {
                    let filter_input = document.querySelector("#" + filter_name + "GoldMin");
                    let filter_row = filter_input.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode;
                    let filter_label = filter_row.firstElementChild.innerText;
                    filter_label = '<span class="applied-filter-label">' + filter_label + '</span>'
                    if (total_min) {
                        filter_label = copper_to_money_span(total_min)  + ' ≤ ' + filter_label;
                    }
                    if (total_max) {
                        filter_label = filter_label + ' ≤ ' + copper_to_money_span(total_max);
                    }
                    // If no items in TSM data for realm or region filters - adding 'disabled' class for filterStats and ignore it
                    if (filter_scale == 'realm' && num_items_realm[ah_id] === 0) {
                        filter_label = filter_label.replace('applied-filter-label', 'applied-filter-label disabled');
                        is_realm_filters_disabled = true;
                    }
                    else if (filter_scale == 'region' && num_items_region[region_id] === 0) {
                        filter_label = filter_label.replace('applied-filter-label', 'applied-filter-label disabled');
                        is_region_filters_disabled = true;
                    }
                    // Otherwise - adding to filter conditions
                    else {
                        filters_conditions[filter_name] = {
                            min: total_min,
                            max: total_max
                        };
                    }
                    applied_filters.push(filter_label);
                }
                break;

            case 'numeric':
                var total_min = Number($("#" + filter_name + "Min").val());
                if (!total_min) {
                    total_min = null;
                }

                var total_max = Number($("#" + filter_name + "Max").val());
                if (!total_max) {
                    total_max = null;
                }
                // If there is no values at all - skip;
                if (!total_min && !total_max) {
                    return;
                }
                else {
                    let filter_input = document.querySelector("#" + filter_name + "Min");
                    let filter_row = filter_input.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode;
                    let filter_label = filter_row.firstElementChild.innerText;
                    filter_label = '<span class="applied-filter-label">' + filter_label + '</span>';
                    if (total_min) {
                        filter_label = total_min  + ' ≤ ' + filter_label;
                    }
                    if (total_max) {
                        filter_label = filter_label + ' ≤ ' + total_max;
                    }
                    // If no items in TSM data for realm or region filters - adding 'disabled' class for filterStats and ignore it
                    if (filter_scale == 'realm' && num_items_realm[ah_id] === 0) {
                        filter_label = filter_label.replace('applied-filter-label', 'applied-filter-label disabled');
                        is_realm_filters_disabled = true;
                    }
                    else if (filter_scale == 'region' && num_items_region[region_id] === 0) {
                        filter_label = filter_label.replace('applied-filter-label', 'applied-filter-label disabled');
                        is_region_filters_disabled = true;
                    }
                    // Otherwise - adding to filter conditions and applied filters (for table columns)
                    else {
                        filters_conditions[filter_name] = {
                            min: total_min,
                            max: total_max
                        }
                    }
                    applied_filters.push(filter_label);
                }
        }
    });

    //  Here filtering process
    chosen_filters = Object.keys(filters_conditions)
    for (const item of cache[ah_id].items) {
        let skip_item = false;
        for (const filter_name of chosen_filters) {
            let item_value = item[filter_name];
            let filter_value_min = filters_conditions[filter_name].min || Number.NEGATIVE_INFINITY;
            let filter_value_max = filters_conditions[filter_name].max || Number.POSITIVE_INFINITY;
            // If no item value for chosen filter, or value does not meet the conditions - skip this item
            if (item_value == null || item_value < filter_value_min || item_value > filter_value_max) {
                skip_item = true;
                break;
            }
        }
        if (!skip_item) {
            filtered_items.push(item);
        }
    }
}

function update_search_result(ah_id, region_id) {
    let num_items_found = filtered_items.length;

    let search_info_html = '';
    // If any filters applied
    if (chosen_filters.length != 0) {
        search_info_html += "<div class='row'><div class='col-auto'>"
        if (num_items_found!= 0) {
            search_info_html += "Found <span class='num-items-total'>" + num_items_found + "</span> items "
        }
        else {
            search_info_html += "No items found "
        }
        search_info_html += "for the following filters:</div></div>"

        applied_filters.forEach(function(filter) {
            if (filter.includes("applied-filter-label disabled")) {
                filter = filter.replace(" disabled", "");
                search_info_html += "<div class='row'><div class='col-auto applied-filter disabled'>" + filter + ",</div></div>";
            }
            else {
                search_info_html += "<div class='row'><div class='col-auto applied-filter'>" + filter + ",</div></div>";
            }
        });
    }
    // If no filters applied
    else {
        search_info_html += "<div class='row'><div class='col-auto'>Showing <span class='num-items-total'>all " + num_items_found + "</span> items</div></div>";
        search_info_html += "<div class='row'><div class='col-auto'>No filters applied - all table columns are shown</div></div>";
    }

    // Removing last comma
    search_info_html = search_info_html.replace(/,(?![^,]*,)/, "");
    $("#filterStats").html(search_info_html);

    let current_timestamp = Date.now() / 1000;
    let ah_cache_updated = timestamp_to_relative_time(current_timestamp, cache[ah_id].ah_timestamp, 5, 2);
    let ah_cache_will_be_updated = timestamp_to_relative_time(cache[ah_id].ah_expires, current_timestamp, 5, 2) || 'few seconds';
    let ah_cache_elapsed = cache[ah_id].ah_elapsed;
    let region_cache_updated = timestamp_to_relative_time(current_timestamp, cache[ah_id].region_timestamp, 5, 2);
    let region_cache_will_be_updated = timestamp_to_relative_time(cache[ah_id].region_expires, current_timestamp, 5, 2) || 'few seconds';
    let region_cache_elapsed = cache[ah_id].region_elapsed;
    let force_data_update = $(force_data_update_checkbox).is(":checked");
    let disable_data_update = $(disable_data_update_checkbox).is(":checked");
    let num_items_cache = cache[ah_id].items.length;
    let cache_stats_html = '';

    // If empty realm or region data
    if (is_realm_filters_disabled) {
        cache_stats_html = '<i class="bi bi-exclamation-triangle red"></i> Warning - TSM has no realm market data for <b>' + current_realm_name;
        if (current_faction_name && current_faction_name != 'All') {
            cache_stats_html += ', ' + current_faction_name;
        }
        cache_stats_html += '</b> <i class="bi bi-exclamation-triangle red"></i></div>'
        cache_stats_html += '<div><u>Only regional filters can be applied</u> (' + num_items_region[region_id] + ' items in region market data)</div>';
    }
    else if (is_region_filters_disabled) {
        cache_stats_html = '<i class="bi bi-exclamation-triangle red"></i> Warning - TSM has no regional market data for <b>' + current_region_name;
        cache_stats_html += '</b> <i class="bi bi-exclamation-triangle red"></i></div>'
        cache_stats_html += '<div><u>Only realm filters were applied</u> (' + num_items_realm[ah_id] + ' items in realm market data)</div>';
    }
    else {
        cache_stats_html += '<div>Total <b>' + num_items_cache + '</b> items in TSM market data for: <b>' + current_realm_name;
        if (current_faction_name && current_faction_name != 'All') {
            cache_stats_html += ', ' + current_faction_name;
        }
        cache_stats_html += ', ' + current_region_name + '</b></div>';
    }
    if (force_data_update) {
        cache_stats_html += '<div><u>Forced cache updating (see checkbox in options above)</u></div>';
    }
    if (disable_data_update) {
        cache_stats_html += '<div><u>Disabled cache updating (see checkbox in options above)</u></div>';
    }

    cache_stats_html += '<div><div class="data-expire">Realm data updated '
    if (ah_cache_updated) {
        cache_stats_html +=  ah_cache_updated + ' ago';
    }
    else {
     cache_stats_html += 'just now';
    }
    cache_stats_html += ', response from TSM took ' + ah_cache_elapsed + ' seconds'

    if (!force_data_update && !disable_data_update) {
        cache_stats_html += ' (next update in ' + ah_cache_will_be_updated + ')';
    }
    cache_stats_html += '</div>';

    cache_stats_html += '<div class="data-expire">Region data updated '
    if (region_cache_updated) {
        cache_stats_html +=  region_cache_updated + ' ago';
    }
    else {
     cache_stats_html += 'just now';
    }
    cache_stats_html += ', response from TSM took ' + region_cache_elapsed + ' seconds'

    if (!force_data_update && !disable_data_update) {
        cache_stats_html += ' (next update in ' + region_cache_will_be_updated + ')';
    }
    cache_stats_html += '</div></div>';
    $("#cacheStats").html(cache_stats_html)
    $("#searchResult").show();
}

function process_tsm_data(tsm_data) {
    let ah_items = tsm_data.data.ah.items;
    let ah_items_ids = Object.keys(ah_items);
    let region_items = tsm_data.data.region.items;
    let region_items_ids = Object.keys(region_items);

    let all_ids = ah_items_ids.concat(region_items_ids);
    all_ids = [...new Set([...ah_items_ids,...region_items_ids])];

    let new_cache = {
        'ah_expires': tsm_data.data.ah.expires,
        'ah_timestamp': tsm_data.data.ah.timestamp,
        'ah_elapsed': tsm_data.data.ah.elapsed,
        'region_expires': tsm_data.data.region.expires,
        'region_timestamp': tsm_data.data.region.timestamp,
        'region_elapsed': tsm_data.data.region.elapsed,
        'items': []
    }

    all_ids.forEach(function(id) {
        let item_meta = {'name': null, 'icon': null, 'quality_color': null, 'id': id};
        let new_item = {'itemId': id,
                        'item': item_meta,
                        'checkbox': true,
                        };
        if (ah_items[id]) {
            new_item['realmBuyout'] = ah_items[id][0];
            new_item['realmMarket'] = ah_items[id][1];
            new_item['realmHistorical'] = ah_items[id][2];
            new_item['realmNumAuctions'] = ah_items[id][3];
            new_item['realmNumItems'] = ah_items[id][4];
        }
        else {
            new_item['realmBuyout'] = null;
            new_item['realmMarket'] = null;
            new_item['realmHistorical'] = null;
            new_item['realmNumAuctions'] = null;
            new_item['realmNumItems'] = null;
        }

        if (region_items[id]) {
            new_item['regionMarket'] = region_items[id][0]
            new_item['regionHistorical'] = region_items[id][1]
            new_item['regionAvgSale'] = region_items[id][2]
            /* Decimal number */
            new_item['regionDailySold'] = region_items[id][3] / 10
            /* Decimal number from 0 to 1000 */
            new_item['regionSaleRate'] = region_items[id][4] / 1000
            new_item['regionNumItems'] = region_items[id][5]
        }
        else {
            new_item['regionMarket'] = null;
            new_item['regionHistorical'] = null;
            new_item['regionAvgSale'] = null;
            new_item['regionDailySold'] = null;
            new_item['regionSaleRate'] = null;
            new_item['regionNumItems'] = null;
        }
        new_cache['items'].push(new_item);
    })
    let ah_id = tsm_data.data.ah.id;
    let region_id = tsm_data.data.region.id;
    num_items_realm[ah_id] = ah_items_ids.length;
    num_items_region[region_id] = region_items_ids.length;
    cache[ah_id] = new_cache;
}

function show_result(ah_id, region_id) {
    filter_tsm_items(ah_id, region_id);
    update_search_result(ah_id, region_id);
    update_table(chosen_filters, filtered_items);
    document.getElementById("searchResult").scrollIntoView({behavior: "smooth"});
}

function showError(error_html) {
    $("#searchResult").hide();
    $("#searchErrorText").html(error_html);
    $("#searchError").show();
    document.getElementById("searchError").scrollIntoView({behavior: "smooth"});
}

function resetError() {
    $("#searchErrorText").html('');
    $("#searchError").hide();
}

function update_and_show_result(ah_id, region_id) {
    let data_update = null;
    if ($(force_data_update_checkbox).prop('checked')) {
        data_update = 'force';
    }
    else if ($(disable_data_update_checkbox).prop('checked')) {
        data_update = 'disable';
    }

    let api_key = $(api_key_input).val();
    let search_button_selector = "#searchButton span";
    let button_content_default = $(search_button_selector).html();
    if (current_search != null) {
        current_search.abort();
    }
    current_search = $.ajax({
        url: "/tsm_data",
        type: "post",
        data: {
            "apiKey": api_key,
            "regionId": region_id,
            "ahId": ah_id,
            "dataUpdate": data_update,
        },
        beforeSend: function( xhr ) {
          xhr.overrideMimeType("application/json; charset=x-user-defined");
          let button_content_new = 'Loading TSM data <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
          update_button_content(search_button_selector, null, button_content_new, 200, 0)
        },
        error: function(xhr) {
            update_button_content(search_button_selector, null, button_content_default, 200, 0);
            let error_html = 'An error occurred:<br>'
            error_html += xhr.statusText + ' ' + xhr.status;
            showError(error_html);
        }
    }).done(function( data ) {
        if (data.errors.length > 0) {
            let error_html = '';
            $(data.errors).each(function(){
                error_html += this + '<br>';
            })
            error_html = error_html.slice(0, -4);
            showError(error_html);

        }
        else if ($.isEmptyObject(data.data.ah.items) && $.isEmptyObject(data.data.region.items)) {
            let error_html = '';
            if (current_faction_name == 'All') {
                error_html += "TSM has no market data for auction houses on the " + current_realm_name + " realm "
            }
            else {
                error_html += "TSM has no market data for " + current_faction_name + " auction houses on the " + current_realm_name + " realm "
            }
            error_html += "in the "+ current_region_name + " region<br>"
            error_html += "(0 items received from TSM API)<br>"
            error_html += "Data may appear once there is trading activity on this realm.";
            showError(error_html);
        }
        else {
            Cookies.set('accessToken', data.accessToken);
            Cookies.set('tokenExpires', data.tokenExpires);
            process_tsm_data(data);
            resetError();
            show_result(ah_id, region_id);
        }
        current_search = null;
        update_button_content(search_button_selector, null, button_content_default, 200, 0);
    });
}

function init_search_button() {
    $(search_button).on("click", function(event) {
        event.preventDefault();
        let current_timestamp = Date.now() / 1000;
        let force_data_update = $(force_data_update_checkbox).prop('checked');
        let disable_data_update = $(disable_data_update_checkbox).prop('checked');
        let ah_id = $(factions_selector).val();
        let region_id = $(regions_selector).val();

        if (!cache[ah_id]) {
            update_and_show_result(ah_id, region_id);
            return;
        }

        let is_cache_ah_expired = cache[ah_id]['ah_expires'] <= current_timestamp;
        let is_cache_region_expired = cache[ah_id]['region_expires'] <= current_timestamp;
        if (disable_data_update) {
            show_result(ah_id, region_id);
        }
        else if (is_cache_ah_expired || is_cache_region_expired || force_data_update) {
            update_and_show_result(ah_id, region_id);
        }
        else {
            show_result(ah_id, region_id);
        }
    })
}

function load_previous_values() {
    /* Call strictly after settings initialising */
    let remember_values = Cookies.get(settings_remember_id)
    if (remember_values == 'true') {
        let api_key = Cookies.get(api_key_id);
        if (api_key) {
            $(api_key_input).val(api_key).change();
        }

        let version = Cookies.get(versions_id);
        if (version) {
            gameVersionsSet(version);
        }

        let region = Cookies.get(regions_id);
        if (region) {
            regionsSet(region);
        }

        let realm = Cookies.get(realms_id);
        if (realm) {
            realmsSet(realm);
        }

        let faction = Cookies.get(factions_id);
        if (faction) {
            factionsSet(faction);
        }

        let remember_settings = Cookies.get(settings_remember_id);
        if (remember_settings == 'true') {
            $(settings_remember_checkbox).prop("checked", true);
        }

        let force_update = Cookies.get(force_data_update_id);
        if (force_update == 'true') {
            $(force_data_update_checkbox).prop('checked', true);
        }

        let disable_update = Cookies.get(disable_data_update_id);
        if (disable_update == 'true') {
            $(disable_data_update_checkbox).prop('checked', true);
        }

        if (is_all_settings_filled()) {
            enable_filters();
        }
        else {
            disable_filters();
        }
    }
    else if (remember_values == 'false') {
        disable_filters();
        clear_selectors([versions_selector, regions_selector, realms_selector, factions_selector]);
        disable_selectors([regions_selector, realms_selector, factions_selector]);
        $(force_data_update_checkbox).prop('checked', false);
        Cookies.remove(force_data_update_id);
        $(disable_data_update_checkbox).prop('checked', false);
        Cookies.remove(disable_data_update_id);
        $("input.table-unit-toggle").each(function(){
            Cookies.remove(this.value + "Disabled");
        });
        Cookies.remove("itemsLocale");
    }
    cookies_loaded = true;
}

function is_all_settings_filled() {
    let api_key_val = $(api_key_input).val().trim();
    let versions_val = $(versions_selector).val();
    let regions_val = $(regions_selector).val();
    let realms_val = $(realms_selector).val();
    let factions_val = $(factions_selector).val();
    if (api_key_val && versions_val && regions_val && realms_val && factions_val) {
        return true;
    }
    else {
        return false;
    }
}

function init_settings() {
    $(api_key_input).on("input", function() {
        let value = $(this).val();
        if (value) {
            Cookies.set(api_key_id, value, cookie_params);
            if (is_all_settings_filled()) {
                enable_filters();
            }
            else {
                disable_filters();
            }
        }
        else {
            Cookies.remove(api_key_id);
            disable_filters()
        }
        Cookies.remove('accessToken');
        Cookies.remove('tokenExpires');
    })

    $(versions_selector).on("change", function() {
        gameVersionsChanged(this);
        let value = $(this).val();
        if (value) {
            Cookies.set(versions_id, value);
        }
        else {
            Cookies.remove(versions_id);
        }
    })

    $(regions_selector).on("change", function() {
        regionsChanged(this);
        let value = $(this).val();
        if (value) {
            Cookies.set(regions_id, value);
        }
        else {
            Cookies.remove(regions_id);
        }
    })

    $(realms_selector).on("change", function() {
        realmsChanged(this);
        let value = $(this).val();
        if (value) {
            Cookies.set(realms_id, value, cookie_params);
        }
        else {
            Cookies.remove(realms_id);
        }
    })

    $(factions_selector).on("change", function() {
        factionsChanged(this);
        let value = $(this).val();
        if (value) {
            Cookies.set(factions_id, value, cookie_params);
        }
        else {
            Cookies.remove(factions_id);
        }
    })

    $(settings_remember_checkbox).on("change", function() {
        let value = $(settings_remember_checkbox).prop("checked");
        if (value) {
            Cookies.set(settings_remember_id, value, cookie_params);
        }
        else {
            Cookies.remove(settings_remember_id);
        }
    })

    $(force_data_update_checkbox).on("change", function() {
        let value = $(force_data_update_checkbox).prop("checked");
        if (value) {
            Cookies.set(force_data_update_id, value, cookie_params);
            $(disable_data_update_checkbox).prop("checked", false);
            Cookies.remove(disable_data_update_id);
        }
        else {
            Cookies.remove(force_data_update_id);
        }
    })

    $(disable_data_update_checkbox).on("change", function() {
        let value = $(disable_data_update_checkbox).prop("checked");
        if (value) {
            Cookies.set(disable_data_update_id, value, cookie_params);
            $(force_data_update_checkbox).prop("checked", false);
            Cookies.remove(force_data_update_id);
        }
        else {
            Cookies.remove(disable_data_update_id);
        }
    })

    /* On first site loading */
    let remember_values = $(settings_remember_checkbox).prop("checked");
    Cookies.set(settings_remember_id, remember_values, cookie_params);

    // Loading game versions selector
    for (game_version of realms_json['gameVersionsList']) {
        $(versions_selector)[0].innerHTML += "<option value='" + game_version + "'>" + game_version + "</option>"
    }

    // Setting realms time updated label
    let timestamp_now = Date.now() / 1000;
    let time_ago = timestamp_to_relative_time(timestamp_now, realms_json['timestamp'], 10, 2)
    if (!time_ago) {
        $("#realmsUpdated")[0].innerHTML = '<i>List of available realms updated just now</i>';
    }
    else {
        $("#realmsUpdated")[0].innerHTML = "<i>List of available realms updated " + time_ago + " ago</i>";
    }
}

function init_tooltips() {
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        let custom_class = '';
        if ($(tooltipTriggerEl).hasClass('tsm-filter-tooltip-icon')) {
            custom_class = 'filter-tooltip-window';
        }
        else {
            custom_class = 'settings-tooltip-window';
        }
        return new bootstrap.Tooltip(tooltipTriggerEl, {
            'customClass': custom_class,
        })
    })
}


$(document).ready(function() {
    init_tooltips();
    init_settings();
    load_previous_values();
    init_tsm_inputs();
    init_tsm_input_daily_sold();
    init_tsm_input_sale_rate();
    init_clear_buttons();
    init_search_button();
    init_table();
});

