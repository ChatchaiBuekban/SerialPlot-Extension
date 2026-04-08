# SerialPlot Extension

A powerful, real-time Serial Plotter for VS Code. Visualize your serial data with ease, apply digital filters, and capture plots for your documentation.

![SerialPlot Icon](resources/icon.png)

## Features

- **Real-time Plotting**: High-performance visualization of serial data stream.
- **Axis Values & Labels**: Automatic and manual Y-axis scaling with clear numeric labels.
- **Advanced Filtering**:
    - **Smooth (SMA)**: Simple Moving Average filter to reduce noise.
    - **Low Pass**: First-order IIR filter for high-frequency noise suppression.
    - **High Pass**: First-order IIR filter to focus on rapid changes in data.
- **Customizable Grid**: Toggle and color-customize the plot grid.
- **Data Capture**: Save high-quality PNG snapshots of your current plot.
- **Flexible Configuration**: Adjust baud rates, sampling points, and filter parameters on the fly.

## How to Use

1. **Connect your Device**: Ensure your serial device (Arduino, ESP32, etc.) is connected to your computer.
2. **Launch the Plotter**: 
   - Press `F1` or `Ctrl+Shift+P` to open the Command Palette.
   - Type `Open Serial Plotter` and press Enter.
3. **Select Connection**:
   - Choose the serial port your device is connected to.
   - Select the desired baud rate (default is 9600).
4. **Interact with the Plot**:
   - Use the **Filter** dropdown to apply real-time smoothing.
   - Adjust the **Param** value to fine-tune the filter's intensity.
   - Toggle **Auto Y-Axis** to switch between automatic scaling and fixed ranges.
   - Click **Capture** to save the current view as an image.

## Requirements

- **Serial Port Access**: Ensure you have the necessary permissions to access serial ports on your operating system.
- **Data Format**: The extension expects numeric data sent over serial, ending with a newline character (`\n`).

## Extension Settings

This extension currently uses a direct command interface. Configuration for each plot is handled within the plotter's webview.

## Known Issues

- Plot performance may vary with extremely high data rates (e.g., >1kHz).
- Only the first numeric value in a serial line is currently plotted.

## Release Notes

### 0.0.1

- Initial release.
- Added real-time plotting with Y-axis values.
- Implemented Smooth, Low Pass, and High Pass filtering.
- Added plot capture functionality.

---

**Developed with ❤️ by Chatchai Buekban**
