// ==UserScript==
// @name         Ingest Vine CSS for Amazon Vine Pages
// @namespace    https://github.com/heminp16
// @version      1
// @description  Injects custom Vine CSS from GitHub into any Amazon Vine page.
// @author       skyline
// @match        https://www.amazon.com/vine/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';

    // Ensure the script only runs on pages under /vine/
    if (!/^https:\/\/www\.amazon\.com\/vine\//.test(window.location.href)) {
        return;
    }

    GM_xmlhttpRequest({
        method: "GET",
        url: "https://raw.githubusercontent.com/heminp16/Vine-Enhancements/refs/heads/main/ios-tiles-edited.css",
        onload: function(response) {
            if (response.status === 200) {
                // Create a style element and inject the fetched CSS into the document head
                const style = document.createElement("style");
                style.type = "text/css";
                style.textContent = response.responseText;
                document.head.appendChild(style);
            } else {
                console.error("Failed to load CSS. Status:", response.status);
            }
        },
        onerror: function(error) {
            console.error("Error loading CSS:", error);
        }
    });
})();