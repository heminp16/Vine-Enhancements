// ==UserScript==
// @name         Vine Discord Poster - Enhanced
// @namespace    https://github.com/heminp16
// @version      2.2.0
// @description  A tool to make posting Vine products to Discord (desktop + mobile) # Rewritten code from `lelouch_di_britannia`
// @author       skyline + lelouch_di_britannia (Discord)
// @match        https://www.amazon.com/vine/vine-items*
// @match        https://www.amazon.co.uk/vine/vine-items*
// @match        https://www.amazon.ca/vine/vine-items*
// @icon         https://i.imgur.com/tIPo4Iy.png
// @updateURL    https://raw.githubusercontent.com/heminp16/Vine-Enhancements/main/brenda-product-share.user.js
// @downloadURL  https://raw.githubusercontent.com/heminp16/Vine-Enhancements/main/brenda-product-share.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

/*
NOTES:
- Amazon no longer guarantees vvp-* classes
- All extraction now relies on structural + attribute signals
- Desktop popover and mobile bottom sheet are handled identically
*/

(function () {
    'use strict';

    //  Constants
    const repoUrl = 'https://raw.githubusercontent.com/heminp16/Vine-Enhancements/main/brenda-product-share.user.js';
    const PRODUCT_IMAGE_ID = /.+\/(.*)\._SS[0-9]+_\.[a-z]{3,4}$/;
    const PRODUCT_TITLE_LENGTH = 47;
    const ITEM_EXPIRY = 7776000000;
    const API_RATE_LIMIT = 10000;

    const urlData = window.location.href.match(
        /(amazon\..+)\/vine\/vine-items(?:\?queue=)?(encore|last_chance|potluck)?.*$/
    );

    const DISCORD_SVG = `
      <svg viewBox="0 -15 130 130" aria-hidden="true"
          style="height:18px;width:18px;margin-right:6px;fill:#5865f2;">
        <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83A72.37,72.37,0,0,0,45.64,0A105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21A105.73,105.73,0,0,0,32.71,96.36A77.7,77.7,0,0,0,39.6,85.25A68.42,68.42,0,0,1,28.75,80.07C29.66,79.41,30.55,78.73,31.41,78.07A75.57,75.57,0,0,0,95.73,78.07C96.6,78.78,97.49,79.46,98.35,80.07A68.68,68.68,0,0,1,87.48,85.26A77,77,0,0,0,94.37,96.36A105.25,105.25,0,0,0,126.6,80.22C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36,40.26,42.45,40.26S53.89,46,53.89,53S48.84,65.69,42.45,65.69ZM84.69,65.69C78.41,65.69,73.25,60,73.25,53S78.25,40.26,84.69,40.26S96.12,46,96.12,53S91.08,65.69,84.69,65.69Z"/>
      </svg>`;


    // Storage
    const defaultSettings = {
        cooldown: { potluck: 0, other: 0 },
        versionCheck: 0,
        apiToken: null
    };

    if (!localStorage.getItem('VDP_SETTINGS')) {
        localStorage.setItem('VDP_SETTINGS', JSON.stringify(defaultSettings));
    }

    if (!localStorage.getItem('VDP_HISTORY')) {
        localStorage.setItem('VDP_HISTORY', JSON.stringify({}));
    }

    function getSettings() {
        return JSON.parse(localStorage.getItem('VDP_SETTINGS'));
    }

    function saveSettings(path, value) {
        const settings = getSettings();
        const keys = path.split('.');
        let ref = settings;

        for (let i = 0; i < keys.length - 1; i++) {
            ref[keys[i]] ||= {};
            ref = ref[keys[i]];
        }

        ref[keys[keys.length - 1]] = value;
        localStorage.setItem('VDP_SETTINGS', JSON.stringify(settings));
    }

    let API_TOKEN = getSettings().apiToken;

    // Global State (normalized)
    let parentAsin = null;
    let parentImage = null;
    let parentTitle = null;
    let queueType = null;
    let recommendationId = null;

    let shareButtonElem = null;
    let productContainer = null;

    //  Utilities
    function qs(sel) {
        return document.querySelector(sel);
    }

    function addGlobalStyle(css) {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    addGlobalStyle(`
        .a-button-discord {
            display: inline-flex;
            align-items: center;
        }

        .a-button-discord.mobile-vertical {
            margin-top: 8px;
        }

        /* Layout the icon + label correctly */
        .a-button-discord .a-button-text {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            line-height: 1;
        }

        /* HARD clamp the Discord SVG */
        .a-button-discord svg.a-button-discord-icon {
            width: 18px !important;
            height: 18px !important;
            min-width: 18px;
            min-height: 18px;
            max-width: 18px;
            max-height: 18px;
            display: inline-block;
            flex: 0 0 auto;
            vertical-align: middle;
        }

        /* Desktop: show text */
        .a-button-discord .a-button-label {
            display: inline;
            white-space: nowrap;
        }

        /* Mobile: icon-only */
        @media (pointer: coarse) {
            .a-button-discord .a-button-label {
                display: none;
            }
        }
    `);


    //  Modal / Sheet Detection   
    function getTitleElement() {
        return (
            qs('#product-details-sheet-title') ||
            qs('#vvp-product-details-modal--product-title')
        );
    }

    function getFooterAndContainer() {
        // Mobile bottom sheet
        const sheetFooter = qs('#product-details-sheet-footer');
        const sheetRoot = qs('.product-details-sheet');
        if (sheetFooter && sheetRoot) {
            return [sheetFooter, sheetRoot];
        }

        // Desktop popover
        const footer = qs('.vvp-modal-footer');
        const wrapper = footer?.closest('.a-popover-wrapper');
        if (footer && wrapper) {
            return [footer, wrapper];
        }

        return null;
    }

    //  Queue Type Resolution
    function d_queueType(type) {
        switch (type) {
            case 'VENDOR_TARGETED': return 'potluck';
            case 'VENDOR_VINE_FOR_ALL': return 'last_chance';
            case 'VINE_FOR_ALL': return 'encore';
            default: return null;
        }
    }

   
    //  Attribute-based Tile Capture
    //  (this replaces vvp-details-btn)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('input[data-asin][data-recommendation-id]');
        if (!btn) return;

        parentAsin = btn.dataset.asin;
        recommendationId = btn.dataset.recommendationId;

        queueType =
            urlData?.[2] ||
            d_queueType(btn.dataset.recommendationType);

        if (!queueType && recommendationId) {
            const hashes = recommendationId.split('#').length - 1;
            queueType = hashes === 3 ? 'potluck' : 'encore';
        }

        const tile = btn.closest('.vvp-item-tile-content');
        if (!tile) return;

        const img = tile.querySelector('img');
        if (img?.src) {
            parentImage = img.src.match(PRODUCT_IMAGE_ID)?.[1] || null;
        }

        parentTitle =
            tile.querySelector('.a-truncate-full.a-offscreen')
            ?.textContent
            ?.substring(0, PRODUCT_TITLE_LENGTH) || null;
    });

    //  Share Button Injection  
    function addShareButton() {
        if (qs('.a-button-discord')) return;

        const modal = getFooterAndContainer();
        if (!modal) return;

        const [footer, container] = modal;
        productContainer = container;

        footer.insertAdjacentHTML(
            'afterbegin',
            `
            <span class="a-button a-button-base a-button-discord">
                <span class="a-button-inner">
                    <input class="a-button-input" type="button">
                    <span class="a-button-text">
                        <svg viewBox="0 -15 130 130"
                            aria-hidden="true"
                            class="a-button-discord-icon">
                            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83A72.37,72.37,0,0,0,45.64,0A105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21A105.73,105.73,0,0,0,32.71,96.36A77.7,77.7,0,0,0,39.6,85.25A68.42,68.42,0,0,1,28.75,80.07C29.66,79.41,30.55,78.73,31.41,78.07A75.57,75.57,0,0,0,95.73,78.07C96.6,78.78,97.49,79.46,98.35,80.07A68.68,68.68,0,0,1,87.48,85.26A77,77,0,0,0,94.37,96.36A105.25,105.25,0,0,0,126.6,80.22C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36,40.26,42.45,40.26S53.89,46,53.89,53S48.84,65.69,42.45,65.69ZM84.69,65.69C78.41,65.69,73.25,60,73.25,53S78.25,40.26,84.69,40.26S96.12,46,96.12,53S91.08,65.69,84.69,65.69Z"
                                  fill="#5865f2"/>
                        </svg>
                        <span class="a-button-label">Share on Discord</span>
                    </span>
                </span>
            </span>
            `
        );

        shareButtonElem = qs('.a-button-discord');
        shareButtonElem.addEventListener('click', buttonHandler);

        new ResizeObserver(updateButtonPosition).observe(container);
    }


    function updateButtonPosition() {
        if (!shareButtonElem || !productContainer) return;

        if (productContainer.offsetWidth < productContainer.offsetHeight) {
            shareButtonElem.classList.add('mobile-vertical');
        } else {
            shareButtonElem.classList.remove('mobile-vertical');
        }
    }

    //  Product Data Extraction 
    function extractProductData() {
        const titleElem = getTitleElement();
        if (!titleElem) return null;

        const asin =
              titleElem.href.match(/\/dp\/([A-Z0-9]+)/)?.[1] || parentAsin;

        const imageElem =
              qs('#product-details-sheet-image') ||
              qs('#vvp-product-details-modal--hero-image');

        const etv =
              qs('#product-details-sheet-tax-value-string')?.innerText ||
              qs('#vvp-product-details-modal--tax-value-string')?.innerText;

        return {
            asin,
            image: imageElem?.src,
            etv: etv?.replace('$', '').trim(),
            queue: queueType
        };
    }

    //  API Handling
    function sendDataToAPI(data) {
        const params = new URLSearchParams({
            version: 2,
            token: API_TOKEN,
            domain: urlData[1],
            tab: data.queue,
            asin: data.asin,
            etv: data.etv,
            comment: '',
            limited: 0
        });

        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    resolve(xhr);
                }
            };
            xhr.open('PUT', 'https://api.llamastories.com/brenda/product', true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.send(params);
        });
    }


    async function buttonHandler(e) {
        e?.preventDefault();
        e?.stopPropagation();

        const data = extractProductData();
        if (!data || !data.asin || !data.queue) {
            console.warn('[VDP] Missing product state', {
                parentAsin,
                queueType
            });
            return;
        }

        console.log('[VDP] Posting', data);
        await sendDataToAPI(data);
    }


    //  Observer
    const observer = new MutationObserver(() => {
        if (getTitleElement()) {
            addShareButton();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
