import * as vscode from 'vscode';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

let panel: vscode.WebviewPanel | undefined;
let serialPort: SerialPort | undefined;

export function activate(context: vscode.ExtensionContext) {

    const startPlotting = async () => {
        const ports = await SerialPort.list();
        if (ports.length === 0) {
            vscode.window.showErrorMessage('No serial ports found. Please check your connection.');
            return;
        }

        const portNames = ports.map(p => p.path);
        const selectedPort = await vscode.window.showQuickPick(portNames, {
            placeHolder: 'Select a serial port to plot'
        });

        if (!selectedPort) {
            return;
        }

        const baudRates = ['9600', '19200', '38400', '57600', '115200'];
        const selectedBaud = await vscode.window.showQuickPick(baudRates, {
            placeHolder: 'Select baud rate (default 9600)'
        }) || '9600';

        if (serialPort && serialPort.isOpen) {
            serialPort.close();
        }

        try {
            serialPort = new SerialPort({ 
                path: selectedPort, 
                baudRate: parseInt(selectedBaud) 
            });

            const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

            if (!panel) {
                panel = vscode.window.createWebviewPanel(
                    'serialPlotter',
                    'Serial Plotter',
                    vscode.ViewColumn.One,
                    { enableScripts: true, retainContextWhenHidden: true }
                );

                panel.webview.html = getWebviewContent();
                
                panel.webview.onDidReceiveMessage(async (message) => {
                    if (message.command === 'saveImage') {
                        const data = message.data.replace(/^data:image\/png;base64,/, "");
                        const buffer = Buffer.from(data, 'base64');
                        
                        const uri = await vscode.window.showSaveDialog({
                            defaultUri: vscode.Uri.file(`serial-plot-${Date.now()}.png`),
                            filters: { 'Images': ['png'] }
                        });

                        if (uri) {
                            await vscode.workspace.fs.writeFile(uri, buffer);
                            vscode.window.showInformationMessage('Plot captured and saved successfully!');
                        }
                    } else if (message.command === 'showError') {
                        vscode.window.showErrorMessage(message.message);
                    }
                }, null, context.subscriptions);

                panel.onDidDispose(() => {
                    panel = undefined;
                    stopPlotting();
                }, null, context.subscriptions);
            }

            panel.reveal(vscode.ViewColumn.One);

            parser.on('data', (line: string) => {
                const trimmed = line.trim();
                if (!trimmed) return;

                // Handle lines that might contain multiple values or labels
                // For now, we take the first numeric value found
                const match = trimmed.match(/[-+]?[0-9]*\.?[0-9]+/);
                if (match) {
                    const value = parseFloat(match[0]);
                    if (!isNaN(value)) {
                        panel?.webview.postMessage({ type: 'data', value });
                    }
                }
            });

            serialPort.on('error', (err) => {
                vscode.window.showErrorMessage(`Serial Port Error: ${err.message}`);
                stopPlotting();
            });

            serialPort.on('open', () => {
                vscode.window.showInformationMessage(`Connected to ${selectedPort} at ${selectedBaud} baud.`);
            });

        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to open port: ${err.message}`);
        }
    };

    const stopPlotting = () => {
        if (serialPort && serialPort.isOpen) {
            serialPort.close();
        }
    };

    let disposable = vscode.commands.registerCommand('serialplot-extension.startPlot', startPlotting);
    context.subscriptions.push(disposable);
}

function getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Serial Plotter</title>
    <style>
        body { 
            background-color: #1e1e1e; 
            color: #ffffff; 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 10px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px 10px;
            background: #252526;
            border-radius: 4px;
            margin-bottom: 10px;
        }
        .controls {
            display: flex;
            gap: 15px;
            align-items: center;
            font-size: 12px;
            color: #ccc;
            flex-wrap: wrap;
        }
        .control-group {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        input[type="number"], select {
            background: #3c3c3c;
            color: white;
            border: 1px solid #555;
            padding: 2px 5px;
            border-radius: 3px;
        }
        input[type="number"] { width: 60px; }
        input:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        canvas { 
            flex-grow: 1;
            background: #000000;
            border: 1px solid #444;
            border-radius: 4px;
        }
        .value-display {
            font-size: 20px;
            font-weight: bold;
            color: #00ff00;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="controls">
            <div class="control-group">
                <span>Y-Axis:</span>
                <input type="checkbox" id="autoY" checked> <label for="autoY">Auto</label>
                <span>Min:</span> <input type="number" id="minY" value="0" disabled>
                <span>Max:</span> <input type="number" id="maxY" value="100" disabled>
            </div>
            <div class="control-group">
                <span>X-Axis:</span>
                <input type="checkbox" id="autoX" checked> <label for="autoX">Auto</label>
                <input type="number" id="pointsX" value="200" disabled>
            </div>
            <div class="control-group">
                <span>Filter:</span>
                <select id="filterType">
                    <option value="none">None</option>
                    <option value="smooth">Smooth (SMA)</option>
                    <option value="lowpass">Low Pass</option>
                    <option value="highpass">High Pass</option>
                </select>
                <span>Param:</span> <input type="number" id="filterParam" value="10" step="0.1" min="0.01" max="100">
            </div>
            <div class="control-group">
                <span>Grid:</span>
                <input type="checkbox" id="showGrid" checked>
                <input type="color" id="gridColor" value="#222222">
            </div>
            <div class="control-group">
                <button id="captureBtn" style="background: #0e639c; color: white; border: none; padding: 2px 8px; border-radius: 2px; cursor: pointer; font-size: 11px;">Capture</button>
            </div>
        </div>
        <div id="currentValue" class="value-display">0.00</div>
    </div>
    <canvas id="plotCanvas"></canvas>
    <script>
        const vscode = acquireVsCodeApi();
        const canvas = document.getElementById('plotCanvas');
        const ctx = canvas.getContext('2d');
        const valueDisplay = document.getElementById('currentValue');
        
        const autoYCheck = document.getElementById('autoY');
        const minYInput = document.getElementById('minY');
        const maxYInput = document.getElementById('maxY');
        const autoXCheck = document.getElementById('autoX');
        const pointsXInput = document.getElementById('pointsX');
        const showGridCheck = document.getElementById('showGrid');
        const gridColorInput = document.getElementById('gridColor');
        const captureBtn = document.getElementById('captureBtn');
        const filterTypeSelect = document.getElementById('filterType');
        const filterParamInput = document.getElementById('filterParam');

        let data = [];
        let rawDataBuffer = []; 
        let lastFilteredValue = 0;
        let lastRawValue = 0;
        
        autoYCheck.addEventListener('change', () => {
            minYInput.disabled = autoYCheck.checked;
            maxYInput.disabled = autoYCheck.checked;
            draw();
        });
        autoXCheck.addEventListener('change', () => {
            pointsXInput.disabled = autoXCheck.checked;
            draw();
        });
        showGridCheck.addEventListener('change', draw);
        gridColorInput.addEventListener('input', draw);
        filterTypeSelect.addEventListener('change', () => {
            const type = filterTypeSelect.value;
            if (type === 'smooth') {
                filterParamInput.value = 10;
                filterParamInput.step = 1;
            } else if (type !== 'none') {
                filterParamInput.value = 0.1;
                filterParamInput.step = 0.01;
            }
            draw();
        });
        filterParamInput.addEventListener('input', draw);
        [minYInput, maxYInput, pointsXInput].forEach(el => el.addEventListener('input', draw));

        captureBtn.addEventListener('click', () => {
            if (data.length < 2) {
                vscode.postMessage({
                    command: 'showError',
                    message: 'No data to capture! Please wait for at least 2 points.'
                });
                return;
            }
            
            captureBtn.style.opacity = '0.5';
            captureBtn.innerText = 'Capturing...';
            
            setTimeout(() => {
                try {
                    const dataURL = canvas.toDataURL('image/png');
                    vscode.postMessage({
                        command: 'saveImage',
                        data: dataURL
                    });
                } catch (e) {
                    console.error('Capture failed:', e);
                }
                captureBtn.style.opacity = '1';
                captureBtn.innerText = 'Capture';
            }, 100);
        });

        function resize() {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            draw();
        }
        window.addEventListener('resize', resize);
        resize();

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'data') {
                const val = message.value;
                rawDataBuffer.push(val);
                if (rawDataBuffer.length > 1000) {
                    rawDataBuffer.splice(0, rawDataBuffer.length - 1000);
                }

                let processedVal = val;
                const type = filterTypeSelect.value;
                const param = parseFloat(filterParamInput.value) || 0;

                if (type === 'smooth') {
                    const taps = Math.max(1, Math.floor(param));
                    if (rawDataBuffer.length >= taps) {
                        const slice = rawDataBuffer.slice(-taps);
                        processedVal = slice.reduce((a, b) => a + b, 0) / taps;
                    }
                } else if (type === 'lowpass') {
                    const alpha = Math.min(1, Math.max(0, param));
                    processedVal = alpha * val + (1 - alpha) * lastFilteredValue;
                } else if (type === 'highpass') {
                    const alpha = Math.min(1, Math.max(0, param));
                    processedVal = alpha * (lastFilteredValue + val - lastRawValue);
                }

                lastFilteredValue = processedVal;
                lastRawValue = val;
                data.push(processedVal);
                
                const paddingLeft = 60;
                const paddingRight = 20;
                const plotWidth = canvas.width - paddingLeft - paddingRight;
                const maxPoints = autoXCheck.checked ? Math.floor(plotWidth / 2) : parseInt(pointsXInput.value);
                
                if (data.length > maxPoints) {
                    data.splice(0, data.length - maxPoints);
                }
                
                valueDisplay.textContent = processedVal.toFixed(2);
                draw();
            }
        });

        function draw() {
            const padding = { top: 20, right: 20, bottom: 30, left: 60 };
            const plotWidth = canvas.width - padding.left - padding.right;
            const plotHeight = canvas.height - padding.top - padding.bottom;

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            if (data.length < 1) {
                // Draw axes even if no data
                ctx.strokeStyle = '#444';
                ctx.beginPath();
                ctx.moveTo(padding.left, padding.top);
                ctx.lineTo(padding.left, canvas.height - padding.bottom);
                ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
                ctx.stroke();
                return;
            }

            // Determine Y range
            let min, max;
            if (autoYCheck.checked) {
                min = Math.min(...data);
                max = Math.max(...data);
                if (max === min) { min -= 5; max += 5; }
                const yPadding = (max - min) * 0.15;
                min -= yPadding;
                max += yPadding;
            } else {
                min = parseFloat(minYInput.value);
                max = parseFloat(maxYInput.value);
            }
            
            const range = max - min;
            const maxPoints = autoXCheck.checked ? Math.floor(plotWidth / 2) : parseInt(pointsXInput.value);
            
            // Draw Grid and Axis Labels
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            
            const yTicks = 5;
            for (let i = 0; i <= yTicks; i++) {
                const val = min + (range * i / yTicks);
                const y = canvas.height - padding.bottom - (i / yTicks * plotHeight);
                
                // Grid line
                if (showGridCheck.checked) {
                    ctx.strokeStyle = gridColorInput.value;
                    ctx.beginPath();
                    ctx.moveTo(padding.left, y);
                    ctx.lineTo(canvas.width - padding.right, y);
                    ctx.stroke();
                }
                
                // Label
                ctx.fillStyle = '#aaa';
                ctx.fillText(val.toFixed(2), padding.left - 8, y);
            }

            // X Axis "Time" or "Samples" label (optional)
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('Samples (last ' + data.length + ')', padding.left + plotWidth/2, canvas.height - padding.bottom + 10);

            // Draw Axis Lines
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding.left, padding.top);
            ctx.lineTo(padding.left, canvas.height - padding.bottom);
            ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
            ctx.stroke();

            // Draw Data Line
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (let i = 0; i < data.length; i++) {
                const x = padding.left + (i / (maxPoints - 1)) * plotWidth;
                const normalized = (data[i] - min) / (range || 1);
                const y = canvas.height - padding.bottom - (normalized * plotHeight);
                
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Gradient fill
            if (data.length >= 2) {
                const lastX = padding.left + ((data.length - 1) / (maxPoints - 1)) * plotWidth;
                const firstX = padding.left;
                
                ctx.lineTo(lastX, canvas.height - padding.bottom);
                ctx.lineTo(firstX, canvas.height - padding.bottom);
                const gradient = ctx.createLinearGradient(0, padding.top, 0, canvas.height - padding.bottom);
                gradient.addColorStop(0, 'rgba(0, 255, 0, 0.2)');
                gradient.addColorStop(1, 'rgba(0, 255, 0, 0)');
                ctx.fillStyle = gradient;
                ctx.fill();
            }
        }
    </script>
</body>
</html>`;
}

export function deactivate() {
    if (serialPort && serialPort.isOpen) {
        serialPort.close();
    }
}
