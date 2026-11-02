# Sortium

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Millennium plugin that adds advanced collection sorting for the Steam client.

## Features

*   **Native Dropdown & Shelf Integration:** Sort collections directly from Steam's native **Sort By** dropdown menu with automatic section dividers (shelves), ascending/descending direction toggling for both custom and built-in Steam sorts, and the ability to hide unwanted default sort options.
*   **HowLongToBeat Sorting:** Sort visible games by Main Story, Main + Extras, Completionist, or All Styles timeframes. Note: This data is sourced via the third-party Augmented Steam API (api.augmentedsteam.com).
*   **Steam Hunters Sorting:** Sort visible games by Median Time, Fastest Time, Hunter Points, SteamDB Rating, or Achievement count.

## Usage

1. Navigate to any Collection in your Steam Library.
2. Open the native **Sort By** dropdown menu to select your preferred Sortium or Steam sort option.
3. Click the arrow icon next to the dropdown to toggle between ascending and descending order.

![Sortium Collection View](screenshots/2026-11-02-180444.png)
![Sortium Sort By Dropdown](screenshots/2026-11-02-180527.png)

## Configuration Options

Sortium provides several customization options through the settings page. Users can customize:
*   **Data Streams & Metrics:** Enable or disable specific data providers (including Steam's native sort options) and their individual metrics.
*   **Data Management:** Adjust Soft and Hard cache expiration days to control background data fetching. You can also manually Force Sync the library or clear the local cache.
*   **Advanced & Debugging:** Toggle developer logging and view current internal states.

![Sortium Settings](screenshots/2026-11-02-180554.png)
## Prerequisites

*   Steam Desktop Client
*   [Millennium Framework](https://steambrew.app/)

## Installation

1. Copy the plugin ID from the [Millennium plugins](https://steambrew.app/plugins) page.
2. Click `Plugins` and `Install a plugin` in the Millennium settings and paste the ID.
3. Restart Steam to allow the plugin to load.

### Manual Installation (Dev Build)

1. Download the latest release from GitHub.
2. Extract the contents into your Millennium plugins directory.
3. Enable the plugin in the Millennium settings.
4. Restart Steam.

## Rate Limits and Force Sync

Collections with over 100 games may encounter API rate limits, preventing all relevant information from being fetched at once. To resolve this:

1. Open the Sortium settings and click the **Force Sync** button.
2. Leave the Steam client running to allow the background queue to process the data.
3. To prevent recurring issues, avoid clearing your cache and ensure your **Hard cache expiration** setting is configured to an appropriate duration.
