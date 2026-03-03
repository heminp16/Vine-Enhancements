// ==UserScript==
// @name         Ingest Vine CSS for Amazon Vine Pages
// @namespace    https://github.com/heminp16
// @version      1.1
// @description  Injects custom Vine CSS from GitHub and applies review score color-coding.
// @author       skyline
// @match        https://www.amazon.com/vine/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';

    // Inject CSS from GitHub
    GM_xmlhttpRequest({
        method: "GET",
        url: "https://raw.githubusercontent.com/heminp16/Vine-Enhancements/refs/heads/main/ios-tiles-edited.css",
        onload: function(response) {
            if (response.status === 200) {
                const style = document.createElement("style");
                style.textContent = response.responseText;
                document.head.appendChild(style);
            } else {
                console.error("[Vine CSS] Failed to load CSS. Status:", response.status);
            }
        },
        onerror: function(error) {
            console.error("[Vine CSS] Error loading CSS:", error);
        }
    });

    // Color-code review quality scores on the reviews page
    const SCORE_MAP = {
        'excellent': 'vvp-review-score--excellent',
        'good':      'vvp-review-score--good',
        'fair':      'vvp-review-score--fair',
        'poor':      'vvp-review-score--poor',
        'pending':   'vvp-review-score--pending',
    };

    function colorizeScores() {
        document.querySelectorAll('.vvp-reviews-table--text-col div').forEach(div => {
            if (!div.textContent.includes('Review quality score')) return;
            const span = div.querySelector('span');
            if (!span || span.dataset.scoreColored) return;

            const val = span.textContent.trim().toLowerCase();
            span.classList.add('vvp-review-score');
            const cls = SCORE_MAP[val];
            if (cls) span.classList.add(cls);
            span.dataset.scoreColored = '1';
        });
    }

    colorizeScores();
    new MutationObserver(colorizeScores).observe(document.body, {
        childList: true,
        subtree: true
    });

})();
