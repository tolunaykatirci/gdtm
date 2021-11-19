___SANDBOXED_JS_FOR_WEB_TEMPLATE___

const log = require('logToConsole');
const JSON = require('JSON');
const isLoadEventType = () => data.eventType === "load";

const isSomewhatAJSON = (value) => typeof value === 'string' && value.indexOf("{") !== -1 && value.indexOf("}") !== -1;
const getAsJSONOrValue = (value) => {
    return (isSomewhatAJSON(value) && JSON.parse(value)) || value;
};

const validateVariablesToLoadScript = () => {
    const COMMON_ERROR_MESSAGE = "Coveo Analytics Script could not be initialized.\n";
    const missingKeys = ['analyticsEndpoint', 'apiKey'].filter(key => !data[key]);
    const hasMissingKeys = missingKeys.length > 0;
    if (missingKeys.length > 0) {
        if (isLoadEventType()) {
            log(COMMON_ERROR_MESSAGE + "The \"Configuration\" section is missing the following keys: " + missingKeys.join(", "));
        } else {
            log(COMMON_ERROR_MESSAGE + "You must either provide the variables in the \"Configuration\" section to the first Coveo Analytics tag or add the \"Load\" event type before this tag.");
        }
        return false;
    }

    return true;
};

const loadCoveoAnalyticsScript = (onSuccess) => {
    const injectScript = require("injectScript");
    const setInWindow = require("setInWindow");
    const createArgumentsQueue = require('createArgumentsQueue');
    const coveoua = createArgumentsQueue('coveoua', 'coveoua.q');
    const getTimestamp = require('getTimestamp');
    setInWindow('coveoua.t', getTimestamp(), true);
    coveoua("init", data.apiKey, data.analyticsEndpoint);
    coveoua("onLoad", function () {
        log('Coveo Analytics Initialized');
    });

    const scriptVersion = data.scriptVersion || "2";
    const url = "https://static.cloud.coveo.com/coveo.analytics.js/" + scriptVersion + "/coveoua.js";
    injectScript(url, onSuccess, data.gtmOnFailure, url);
};

const loadCoveoAnalyticsScriptIfNotLoaded = (onSuccess, onFailure) => {
    const copyFromWindow = require("copyFromWindow");
    const isLoaded = copyFromWindow("coveoua");
    if (!isLoaded) {
        if (!validateVariablesToLoadScript()) {
            onFailure();
        }
        loadCoveoAnalyticsScript(onSuccess);
    } else {
        onSuccess();
    }
};

const addToObject = function (obj) {
    for (let index in arguments) {
        const obj2 = arguments[index];
        for (let key in obj2) {
            if (obj2.hasOwnProperty(key)) {
                obj[key] = obj2[key];
            }
        }
    }
    return obj;
};

const isObjectEmpty = function (obj) {
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            return false;
        }
    }
    return true;
};

const generateCustomData = () => {
    const customDataObject = {};

    if (!!data.customDataTable && data.customDataTable.length > 0) {
        const makeParsedTableMap = (table) => {
            const makeTableMap = require('makeTableMap');
            const tableWithParsedValues = table.map((row) => ({ key: row.key, value: getAsJSONOrValue(row.value) }));
            return makeTableMap(tableWithParsedValues, 'key', 'value');
        };

        const objForUsageAnalytics = makeParsedTableMap(data.customDataTable);
        addToObject(customDataObject,
            objForUsageAnalytics);
    }

    if (!!data.customDataObjects && data.customDataObjects.length > 0) {
        const getValidCustomDataObjectsFromArray = (objects) => {
            return objects.map(row => row.object).map(getAsJSONOrValue).filter(obj => typeof obj === 'object');
        };

        getValidCustomDataObjectsFromArray(data.customDataObjects)
            .forEach(obj => addToObject(customDataObject, obj));
    }

    return customDataObject;
};

const eventTypeMap = {
    custom: "custom"
};

const eventDataForTypeMap = {
    custom: {
        eventType: data.customEventType,
        eventValue: data.customEventValue,
        customData: {}
    }
};

const measurementProtocolTypeMap = {
    view: 'pageview',
    event: 'event'
};

const logWithMeasurementProtocol = () => {
    const copyFromDataLayer = require("copyFromDataLayer");
    const event = copyFromDataLayer('event');
    const ecommerce = copyFromDataLayer('ecommerce');
    const createArgumentsQueue = require('createArgumentsQueue');
    const coveoua = createArgumentsQueue('coveoua', 'coveoua.q');
    if (ecommerce) {
        const setAction = (action, metadata) => !!metadata ? coveoua("ec:setAction", action, metadata) : coveoua("ec:setAction", action);
        const addAllProductsIfDefined = (products) => !!products && products.forEach(product => coveoua("ec:addProduct", product));
        const addAllImpressionsIfDefined = (impressions) => !!impressions && impressions.forEach(impression => coveoua("ec:addImpression", impression));
        if (ecommerce.currencyCode) {
            coveoua("set", "currencyCode", ecommerce.currencyCode);
        }

        const eventMapping = {
            "gtm.load": ["refund", "purchase", "detail"],
            "gtm.dom": ["refund", "purchase", "detail"],
            "addToCart": ["add"],
            "removeFromCart": ["remove"],
            "checkout": ["checkout"],
            "checkoutOption": ["checkout_option"],
            "productClick": ["click"],
            // Custom event type, in case you want to send them after "gtm.load" or "gtm.dom".
            "refund": ["refund"],
            "purchase": ["purchase"],
            "detailView": ["detail"],
            "impression": ["impression", "impressions"]
        };

        const customCoveoActionsOverride = {
            "impressions": "impression"
        };

        const eventsToTest = eventMapping[event];
        const eventsFoundForType = !!eventsToTest && eventsToTest.filter(e => ecommerce.hasOwnProperty(e));
        const ecommerceDataLayerToUse = eventsFoundForType.length > 0 && ecommerce[eventsFoundForType[0]];

        if (ecommerceDataLayerToUse) {
            addAllProductsIfDefined(ecommerceDataLayerToUse.products);
            addAllImpressionsIfDefined(ecommerceDataLayerToUse.impressions);
            const action = eventsFoundForType[0];
            setAction(customCoveoActionsOverride[action] || action, ecommerceDataLayerToUse.actionField);
        }

        addAllImpressionsIfDefined(ecommerce.impressions);
    }

    log('Coveo Using Measurement Protocol');

    const customData = generateCustomData();
    if (isObjectEmpty(customData)) {
        coveoua("send", measurementProtocolTypeMap[data.eventType]);
    } else {
        coveoua("send", measurementProtocolTypeMap[data.eventType], customData);
    }
};

const logCoveoAnalyticsEvent = () => {
    const eventDataForType = eventDataForTypeMap[data.eventType];
    addToObject(eventDataForType.customData, generateCustomData());
    const getUrl = require("getUrl");
    const getReferrerUrl = require("getReferrerUrl");
    const readTitle = require("readTitle");
    const eventData = {
        location: data.location || getUrl(),
        referrer: data.referrer || getReferrerUrl(),
        language: data.language,
        title: data.title || readTitle(),
        anonymous: data.isAnonymous,
        username: data.username,
        userDisplayName: data.userDisplayName
    };

    addToObject(eventData, eventDataForType);

    log('Coveo Analytics Data =', eventData);

    const createArgumentsQueue = require('createArgumentsQueue');
    const coveoua = createArgumentsQueue('coveoua', 'coveoua.q');
    coveoua("send", eventTypeMap[data.eventType], eventData);
};

loadCoveoAnalyticsScriptIfNotLoaded(() => {
    if (!isLoadEventType()) {
        if (eventDataForTypeMap[data.eventType]) {
            logCoveoAnalyticsEvent();
        } else {
            logWithMeasurementProtocol();
        }
    }
    data.gtmOnSuccess();
}, () => {
    data.gtmOnFailure();
});
