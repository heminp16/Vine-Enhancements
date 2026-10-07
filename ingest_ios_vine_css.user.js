// ==UserScript==
// @name         Ingest Vine CSS for Amazon Vine Pages
// @namespace    https://github.com/heminp16
// @version      1.3
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
    if (!location.pathname.startsWith('/vine/vine-reviews')) return;

    const SCORE_MAP = {
        'excellent': 'vvp-review-score--excellent',
        'good':      'vvp-review-score--good',
        'fair':      'vvp-review-score--fair',
        'poor':      'vvp-review-score--poor',
        'pending':   'vvp-review-score--pending',
    };

    const scoreCellSelector = '.vvp-reviews-table--text-col';

    function colorizeScores(cell) {
        cell.querySelectorAll('div').forEach(div => {
            if (!div.textContent.includes('Review quality score')) return;
            const span = div.querySelector('span');
            if (!span) return;

            const val = span.textContent.trim().toLowerCase();
            if (span.dataset.scoreColored === val) return;
            span.classList.add('vvp-review-score');
            Object.entries(SCORE_MAP).forEach(([score, cls]) => {
                span.classList.toggle(cls, score === val);
            });
            span.dataset.scoreColored = val;
        });
    }

    let scoreUpdatePending = false;
    const pendingScoreCells = new Set();
    function scheduleScoreUpdate() {
        if (scoreUpdatePending) return;
        scoreUpdatePending = true;
        requestAnimationFrame(() => {
            scoreUpdatePending = false;
            const cells = Array.from(pendingScoreCells);
            pendingScoreCells.clear();
            cells.forEach(cell => {
                if (cell.isConnected) colorizeScores(cell);
            });
        });
    }

    document.querySelectorAll(scoreCellSelector).forEach(colorizeScores);
    new MutationObserver((records) => {
        records.forEach((record) => {
            const element = record.target.nodeType === 1
                ? record.target
                : record.target.parentElement;
            const cell = element?.closest(scoreCellSelector);
            if (cell) {
                pendingScoreCells.add(cell);
                return;
            }
            record.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                if (node.matches(scoreCellSelector)) pendingScoreCells.add(node);
                node.querySelectorAll(scoreCellSelector).forEach(cell => pendingScoreCells.add(cell));
            });
        });
        if (pendingScoreCells.size) scheduleScoreUpdate();
    }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });

})();
