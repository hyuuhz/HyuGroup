'use strict';

/**
 * ==============================================
 * MiroTalk P2P v.2.2.50 - Configuration File
 * ==============================================
 *
 * This file is the central configuration source.
 * All environment variables are read here so the
 * rest of the codebase imports config values
 * instead of reading process.env directly.
 *
 * Structure (same order as .env.template):
 *   1. Core                         6. API & Webhook
 *   2. Security                     7. Integrations
 *   3. Authentication & Access      8. Monitoring & Notifications
 *   4. WebRTC (STUN/TURN)           9. UI Customization (Branding)
 *   5. Rooms & Features            10. UI Buttons
 *
 * Setup:
 *   cp app/src/config.template.js app/src/config.js
 *   Then edit config.js to match your environment.
 *
 * Docker/container environments inject values via
 * environment variables which are read at startup.
 *
 * Branding and customizations require a license:
 * https://codecanyon.net/item/mirotalk-p2p-webrtc-realtime-video-conferences/38376661
 */

require('dotenv').config();

const packageJson = require('../../package.json');
const { parseHostUsers } = require('./hostUsers');

// Helper: parse env string to boolean
function getEnvBoolean(key, force_true_if_undefined = false) {
    if (key == undefined && force_true_if_undefined) return true;
    return key == 'true' ? true : false;
}

// Helper: safely parse JSON env vars with a fallback
function parseJsonEnv(envValue, fallback) {
    if (!envValue) return fallback;
    try {
        return JSON.parse(envValue);
    } catch (e) {
        return fallback;
    }
}

const port = process.env.PORT || 3000;

module.exports = {
    // ##########################################################
    // 1. CORE
    // ##########################################################

    // ==========================================
    // Server
    // ==========================================
    server: {
        port: port,
        host: process.env.HOST || `http://localhost:${port}`,
        environment: process.env.NODE_ENV || 'development',
        trustProxy: !!getEnvBoolean(process.env.TRUST_PROXY),

        /**
         * Embed (iframe) Restrictions
         * ---------------------------
         * Controls which origins are allowed to embed MiroTalk P2P in an <iframe>
         * via the HTTP `Content-Security-Policy: frame-ancestors` header
         * (also mirrored to `X-Frame-Options` when possible for legacy browsers).
         *
         * Behavior:
         * - Empty / unset  → header NOT set, embedding allowed anywhere (default).
         * - 'none'         → block ALL embedding (frame-ancestors 'none' + X-Frame-Options: DENY).
         * - 'self'         → only same-origin embedding (frame-ancestors 'self' + X-Frame-Options: SAMEORIGIN).
         * - list           → comma-separated origins, 'self' is always implicitly included.
         *                    Wildcards like https://*.example.com are valid in CSP.
         *
         * IMPORTANT: This affects the widget too — the MiroTalk widget embeds
         * the room in an iframe on the host site, so every site that should
         * load the widget must be listed here.
         */
        embed: {
            allowedOrigins: process.env.ALLOWED_EMBED_ORIGINS
                ? process.env.ALLOWED_EMBED_ORIGINS.split(',')
                      .map((o) => o.trim())
                      .filter(Boolean)
                : [],
        },
    },

    // ##########################################################
    // 2. SECURITY
    // ##########################################################

    // ==========================================
    // JWT
    // ==========================================
    jwt: {
        key: process.env.JWT_KEY, // Required: min 32 chars (openssl rand -hex 32), server won't start without it
        exp: process.env.JWT_EXP || '1h',
    },

    // ==========================================
    // CORS
    // ==========================================
    cors: {
        origin: parseJsonEnv(process.env.CORS_ORIGIN, '*'),
        methods: parseJsonEnv(process.env.CORS_METHODS, ['GET', 'POST']),
    },

    // ==========================================
    // IP Whitelist
    // ==========================================
    ipWhitelist: {
        enabled: getEnvBoolean(process.env.IP_WHITELIST_ENABLED),
        allowed: parseJsonEnv(process.env.IP_WHITELIST_ALLOWED, []),
    },

    // ##########################################################
    // 3. AUTHENTICATION & ACCESS
    // ##########################################################

    // ==========================================
    // Host Protection
    // ==========================================
    host: {
        protected: getEnvBoolean(process.env.HOST_PROTECTED),
        userAuth: getEnvBoolean(process.env.HOST_USER_AUTH),
        // HOST_USERS (same format as MiroTalk SFU), passwords must contain between 1 and 36 characters:
        // - Compact: username:password:displayname:room1,room2|username2:password2:displayname2:*
        // - JSON:    [{"username":"alice","password":"pw","displayname":"Alice","allowed_rooms":["*"]}]
        // - displayname   : optional, enforced as the user's name in the room (not editable)
        // - allowed_rooms : optional, rooms the user can open/join with this login ('*' = all, default)
        // Empty by default: a shipped username/password is a public credential, set your own.
        users: parseHostUsers(process.env.HOST_USERS),
        maxLoginAttempts: process.env.HOST_MAX_LOGIN_ATTEMPTS || 5,
        minLoginBlockTime: process.env.HOST_MIN_LOGIN_BLOCK_TIME || 15, // in minutes
        // /createRoomToken rate limit (per IP)
        createRoomTokenMaxRequests: parseInt(process.env.CREATE_ROOM_TOKEN_RATE_LIMIT_MAX) || 10,
        createRoomTokenWindowMinutes: parseInt(process.env.CREATE_ROOM_TOKEN_RATE_LIMIT_WINDOW_MINUTES) || 1,
        maxRoomParticipants: parseInt(process.env.ROOM_MAX_PARTICIPANTS) || 1000,
        showActiveRooms: getEnvBoolean(process.env.SHOW_ACTIVE_ROOMS) || false,
    },

    // ==========================================
    // OIDC - OpenID Connect
    // ==========================================
    oidc: {
        enabled: process.env.OIDC_ENABLED ? getEnvBoolean(process.env.OIDC_ENABLED) : false,
        allowRoomCreationForAuthUsers: process.env.OIDC_ALLOW_ROOMS_CREATION_FOR_AUTH_USERS
            ? getEnvBoolean(process.env.OIDC_ALLOW_ROOMS_CREATION_FOR_AUTH_USERS)
            : false,
        // Authenticated OIDC users join with the name verified by the identity provider and cannot change it
        lockUsername: process.env.OIDC_LOCK_USERNAME ? getEnvBoolean(process.env.OIDC_LOCK_USERNAME) : true,
        baseUrlDynamic: process.env.OIDC_BASE_URL_DYNAMIC ? getEnvBoolean(process.env.OIDC_BASE_URL_DYNAMIC) : false,
        /*
         * When `baseUrlDynamic` is true, the OIDC baseURL (and therefore the redirect_uri
         * sent to the IdP) is derived from the incoming `Host` header. To prevent
         * Host-header injection from redirecting authorization codes to an attacker,
         * list every origin the server is allowed to serve here (full origin, no path).
         * The static `config.baseURL` is always trusted and does not need to be repeated.
         * Example: ['https://p2p.mirotalk.com', 'https://meet.example.com']
         */
        allowedDynamicBaseURLs: process.env.OIDC_ALLOWED_DYNAMIC_BASE_URLS
            ? process.env.OIDC_ALLOWED_DYNAMIC_BASE_URLS.split(',')
                  .map((u) => u.trim())
                  .filter(Boolean)
            : [],
        config: {
            issuerBaseURL: process.env.OIDC_ISSUER_BASE_URL,
            clientID: process.env.OIDC_CLIENT_ID,
            clientSecret: process.env.OIDC_CLIENT_SECRET,
            baseURL: process.env.OIDC_BASE_URL,
            secret: process.env.SESSION_SECRET,
            authorizationParams: {
                response_type: 'code',
                scope: 'openid profile email',
            },
            authRequired: process.env.OIDC_AUTH_REQUIRED ? getEnvBoolean(process.env.OIDC_AUTH_REQUIRED) : false,
            auth0Logout: process.env.OIDC_AUTH_LOGOUT ? getEnvBoolean(process.env.OIDC_AUTH_LOGOUT) : true,
            routes: {
                callback: '/auth/callback',
                login: false,
                logout: '/logout',
            },
        },
    },

    // ==========================================
    // Presenters
    // ==========================================
    // Array of authenticated identities who are always presenters:
    // - LOGIN usernames for host protection / user auth or a valid JWT token
    // - verified email or `sub` of the OIDC user when OIDC is enabled
    // - '*' : any authenticated OIDC user (OIDC only, never matches host logins or JWT usernames)
    // The join-form display name is never matched, so with no auth enabled this list has no
    // effect (the first participant to join is the presenter). Empty by default.
    presenters: parseJsonEnv(process.env.PRESENTERS, []),

    // ##########################################################
    // 4. WEBRTC (STUN/TURN)
    // ##########################################################

    // ==========================================
    // WebRTC ICE Servers
    // ==========================================
    webrtc: {
        stun: {
            enabled: getEnvBoolean(process.env.STUN_SERVER_ENABLED),
            url: process.env.STUN_SERVER_URL,
        },
        turn: {
            enabled: getEnvBoolean(process.env.TURN_SERVER_ENABLED),
            url: process.env.TURN_SERVER_URL,
            username: process.env.TURN_SERVER_USERNAME,
            credential: process.env.TURN_SERVER_CREDENTIAL,
        },
    },

    // ##########################################################
    // 5. ROOMS & FEATURES
    // ##########################################################

    // ==========================================
    // Breakout Rooms
    // ==========================================
    // Presenters split the participants into smaller rooms (disabled by default).
    // When disabled the server ignores every breakout request, so no breakout ticket is ever issued.
    breakoutRooms: {
        enabled: getEnvBoolean(process.env.BREAKOUT_ROOMS_ENABLED),
    },

    // ==========================================
    // Lobby
    // ==========================================
    // Default lobby state of new rooms: guests wait until a presenter admits them.
    // Presenters can turn it on/off per room. Presenters and authenticated users never wait.
    lobby: {
        enabled: getEnvBoolean(process.env.LOBBY_ENABLED),
    },

    // ==========================================
    // Survey
    // ==========================================
    survey: {
        enabled: getEnvBoolean(process.env.SURVEY_ENABLED),
        url: process.env.SURVEY_URL || 'https://www.questionpro.com/t/AUs7VZq00L',
    },

    // ==========================================
    // Redirect
    // ==========================================
    redirect: {
        enabled: getEnvBoolean(process.env.REDIRECT_ENABLED),
        url: process.env.REDIRECT_URL || '/newcall',
    },

    // ##########################################################
    // 6. API & WEBHOOK
    // ##########################################################

    // ==========================================
    // API
    // ==========================================
    api: {
        keySecret: process.env.API_KEY_SECRET,
        disabled: parseJsonEnv(process.env.API_DISABLED, ['token', 'meetings']),
    },

    // ==========================================
    // Webhook
    // ==========================================
    webhook: {
        enabled: getEnvBoolean(process.env.WEBHOOK_ENABLED), // Enable webhook functionality
        url: process.env.WEBHOOK_URL || 'http://localhost:8888/webhook-endpoint', // Webhook server URL
    },

    // ##########################################################
    // 7. INTEGRATIONS
    // ##########################################################

    // ==========================================
    // Ngrok
    // ==========================================
    ngrok: {
        enabled: getEnvBoolean(process.env.NGROK_ENABLED),
        authToken: process.env.NGROK_AUTH_TOKEN,
    },

    // ==========================================
    // Slack
    // ==========================================
    slack: {
        enabled: getEnvBoolean(process.env.SLACK_ENABLED),
        signingSecret: process.env.SLACK_SIGNING_SECRET,
    },

    // ==========================================
    // Mattermost
    // ==========================================
    mattermost: {
        enabled: getEnvBoolean(process.env.MATTERMOST_ENABLED),
        serverUrl: process.env.MATTERMOST_SERVER_URL,
        username: process.env.MATTERMOST_USERNAME,
        password: process.env.MATTERMOST_PASSWORD,
        token: process.env.MATTERMOST_TOKEN,
        roomTokenExpire: process.env.MATTERMOST_ROOM_TOKEN_EXPIRE,
    },

    // ==========================================
    // ChatGPT / OpenAI
    // ==========================================
    chatGPT: {
        enabled: getEnvBoolean(process.env.CHATGPT_ENABLED),
        basePath: process.env.CHATGPT_BASE_PATH,
        apiKey: process.env.CHATGPT_APIKEY,
        model: process.env.CHATGPT_MODEL || 'gpt-6-luna',
        max_tokens: parseInt(process.env.CHATGPT_MAX_TOKENS),
        temperature: parseFloat(process.env.CHATGPT_TEMPERATURE),
        // Reasoning models only (none|low|medium|high|xhigh|max), empty for non-reasoning models.
        // temperature is only sent when reasoning_effort is 'none' or empty.
        reasoning_effort: process.env.CHATGPT_REASONING_EFFORT ?? 'none',
    },

    // ==========================================
    // GIF Search in chat (KLIPY)
    // ==========================================
    // Optional GIF picker in the chat, powered by KLIPY
    // (a free, drop-in replacement for the discontinued Tenor API).
    //
    // Setup:
    // 1. Create a free API key at https://partner.klipy.com/ (API Keys)
    // 2. Set KLIPY_API_ENABLED=true and KLIPY_API_KEY in your .env file
    // 3. Restart the server
    //
    // - enabled       : Enable/disable GIF search [true/false] (default: false)
    // - apiKey        : KLIPY app key. Per KLIPY's integration requirements, searches are
    //                   sent directly from the browser, so this key is shared with joined peers.
    // - contentFilter : Content safety level [off/low/medium/high] (default: 'high')
    //
    // Notes:
    // - Testing-mode keys are limited to 100 requests/hour; request Production access
    //   in the KLIPY Partner Panel to remove the limit.
    // - Attribution: the picker uses the required "Search KLIPY" placeholder and shows "Powered by KLIPY".
    //   See https://docs.klipy.com/attribution and https://docs.klipy.com/integration-requirements
    gifSearch: {
        enabled: getEnvBoolean(process.env.KLIPY_API_ENABLED),
        apiKey: process.env.KLIPY_API_KEY || '',
        contentFilter: process.env.KLIPY_CONTENT_FILTER || 'high',
    },

    // ==========================================
    // Whisper Speech-to-Text (server-side transcription)
    // ==========================================
    // Server-side audio transcription using an OpenAI-compatible Whisper
    // endpoint. Works with the official OpenAI API or any self-hosted,
    // OpenAI-compatible server (whisper.cpp server, faster-whisper, etc.).
    //
    // IMPORTANT: Whisper is a side-channel only. The browser records short
    // audio segments from a SECONDARY copy of the local microphone stream and
    // sends them here for transcription. It NEVER sits in the WebRTC media
    // path: the RTCPeerConnection audio track is untouched and keeps the
    // lowest possible latency. The resulting text is distributed to peers over
    // the existing WebRTC DataChannel, not through this server.
    //
    // - enabled        : Enable/disable Whisper transcription [true/false] (default: false)
    // - basePath       : OpenAI-compatible API endpoint (default: 'https://api.openai.com/v1/')
    //                    For a self-hosted server use e.g. 'http://localhost:8000/v1/'
    // - apiKey         : API secret key (ALWAYS store in .env, never sent to the browser).
    //                    May be empty for self-hosted servers that don't require auth.
    // - model          : Whisper model name (default: 'whisper-1')
    // - language       : Optional ISO-639-1 language hint (e.g. 'en'). Empty = auto-detect.
    // - segmentSeconds : Length of each recorded audio segment sent for transcription (default: 3)
    // - maxAudioBytes  : Reject audio segments larger than this (default: 25MB)
    whisper: {
        enabled: getEnvBoolean(process.env.WHISPER_ENABLED),
        basePath: process.env.WHISPER_BASE_PATH || 'https://api.openai.com/v1/',
        apiKey: process.env.WHISPER_API_KEY || '',
        model: process.env.WHISPER_MODEL || 'whisper-1',
        language: process.env.WHISPER_LANGUAGE || '',
        segmentSeconds: parseInt(process.env.WHISPER_SEGMENT_SECONDS) || 3,
        maxAudioBytes: parseInt(process.env.WHISPER_MAX_AUDIO_BYTES) || 25 * 1024 * 1024,
    },

    // ==========================================
    // IP Lookup
    // ==========================================
    ipLookup: {
        enabled: getEnvBoolean(process.env.IP_LOOKUP_ENABLED),
    },

    // ##########################################################
    // 8. MONITORING & NOTIFICATIONS
    // ##########################################################

    // ==========================================
    // Sentry
    // ==========================================
    sentry: {
        enabled: getEnvBoolean(process.env.SENTRY_ENABLED),
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.0'),
        logLevels: process.env.SENTRY_LOG_LEVELS
            ? process.env.SENTRY_LOG_LEVELS.split(',').map((level) => level.trim())
            : ['error'],
    },

    // ==========================================
    // Email
    // ==========================================
    email: {
        alert: process.env.EMAIL_ALERT === 'true' || false,
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT),
        username: process.env.EMAIL_USERNAME,
        password: process.env.EMAIL_PASSWORD,
        from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME,
        sendTo: process.env.EMAIL_SEND_TO,
        https: process.env.HTTPS === 'true' || false,
        serverPort: process.env.PORT || 3000,
    },

    // ==========================================
    // Stats / Analytics
    // ==========================================
    stats: {
        enabled: process.env.STATS_ENABLED ? getEnvBoolean(process.env.STATS_ENABLED) : true,
        src: process.env.STATS_SCR || 'https://stats.mirotalk.com/script.js',
        id: process.env.STATS_ID || 'c7615aa7-ceec-464a-baba-54cb605d7261',
    },

    // ##########################################################
    // 9. UI CUSTOMIZATION (BRANDING)
    // ##########################################################

    // ==========================================
    // Branding (UI customizations)
    // ==========================================
    // Every value can be overridden via environment variables (see .env.template),
    // unset variables keep the defaults below. Set BRAND_HTML_INJECTION=false to
    // disable HTML injection and use static branding in the public/views folder.
    brand: {
        htmlInjection: getEnvBoolean(process.env.BRAND_HTML_INJECTION, true),
        app: {
          
