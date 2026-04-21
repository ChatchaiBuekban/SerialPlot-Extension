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
                    } else if (message.command === 'saveLog') {
                        const data = message.data;
                        const buffer = Buffer.from(data, 'utf-8');
                        
                        const uri = await vscode.window.showSaveDialog({
                            defaultUri: vscode.Uri.file(`serial-log-${Date.now()}.csv`),
                            filters: { 'CSV Files': ['csv'], 'Text Files': ['txt'] }
                        });

                        if (uri) {
                            await vscode.workspace.fs.writeFile(uri, buffer);
                            vscode.window.showInformationMessage('Log saved successfully!');
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
                if (!trimmed) {
                    return;
                }

                // Split by common delimiters: comma, semicolon, space, tab
                const parts = trimmed.split(/[,;\s\t]+/);
                const values: number[] = [];
                
                for (const part of parts) {
                    const match = part.match(/[-+]?[0-9]*\.?[0-9]+/);
                    if (match) {
                        const val = parseFloat(match[0]);
                        if (!isNaN(val)) {
                            values.push(val);
                        }
                    }
                }

                if (values.length > 0) {
                    panel?.webview.postMessage({ type: 'data', values });
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
            background-color: var(--vscode-editor-background); 
            color: var(--vscode-editor-foreground); 
            font-family: var(--vscode-font-family);
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
            background: var(--vscode-sideBar-background);
            border-radius: 4px;
            margin-bottom: 10px;
            border: 1px solid var(--vscode-panel-border);
        }
        .controls {
            display: flex;
            gap: 15px;
            align-items: center;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            flex-wrap: wrap;
        }
        .control-group {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        input[type="number"], select {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
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
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }
        .value-container {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            justify-content: flex-end;
        }
        .value-display {
            font-size: 16px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 10px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 11px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button#pauseBtn.paused {
            background: var(--vscode-debugIcon-startForeground);
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
                <span>Split:</span>
                <input type="checkbox" id="splitView">
            </div>
            <div class="control-group">
                <button id="pauseBtn">Pause</button>
                <button id="logBtn">Start Log</button>
                <button id="captureBtn">Capture</button>
            </div>
        </div>
        <div id="valueContainer" class="value-container"></div>
    </div>
    <canvas id="plotCanvas"></canvas>
    <script>
        const vscode = acquireVsCodeApi();
        const canvas = document.getElementById('plotCanvas');
        const ctx = canvas.getContext('2d');
        const valueContainer = document.getElementById('valueContainer');
        
        const autoYCheck = document.getElementById('autoY');
        const minYInput = document.getElementById('minY');
        const maxYInput = document.getElementById('maxY');
        const autoXCheck = document.getElementById('autoX');
        const pointsXInput = document.getElementById('pointsX');
        const showGridCheck = document.getElementById('showGrid');
        const gridColorInput = document.getElementById('gridColor');
        const splitViewCheck = document.getElementById('splitView');
        const pauseBtn = document.getElementById('pauseBtn');
        const logBtn = document.getElementById('logBtn');
        const captureBtn = document.getElementById('captureBtn');
        const filterTypeSelect = document.getElementById('filterType');
        const filterParamInput = document.getElementById('filterParam');

        const COLORS = ['#00ff00', '#ff3333', '#33aaff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#ffffff'];
        let seriesData = []; // Array of arrays
        let seriesRawBuffer = []; 
        let seriesLastFiltered = [];
        let seriesLastRaw = [];
        let isPaused = false;
        let isLogging = false;
        let logBuffer = "";
        
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
        splitViewCheck.addEventListener('change', draw);

        pauseBtn.addEventListener('click', () => {
            isPaused = !isPaused;
            pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
            pauseBtn.classList.toggle('paused', isPaused);
        });

        logBtn.addEventListener('click', () => {
            if (!isLogging) {
                isLogging = true;
                logBuffer = "Timestamp, " + seriesData.map((_, i) => "Channel " + (i+1)).join(", ") + "\\n";
                logBtn.textContent = "Stop Log";
                logBtn.style.background = "var(--vscode-debugIcon-stopForeground)";
            } else {
                isLogging = false;
                logBtn.textContent = "Start Log";
                logBtn.style.background = "var(--vscode-button-background)";
                if (logBuffer.length > 0) {
                    vscode.postMessage({
                        command: 'saveLog',
                        data: logBuffer
                    });
                }
            }
        });

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
            if (seriesData.length === 0 || seriesData[0].length < 2) {
                vscode.postMessage({
                    command: 'showError',
                    message: 'No data to capture!'
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
            if (message.type === 'data' && message.values) {
                if (isPaused) {
                    return;
                }
                const values = message.values;
                
                // Initialize/Expand series if more streams appear
                if (seriesData.length < values.length) {
                    for (let i = seriesData.length; i < values.length; i++) {
                        seriesData[i] = [];
                        seriesRawBuffer[i] = [];
                        seriesLastFiltered[i] = 0;
                        seriesLastRaw[i] = 0;
                        
                        const div = document.createElement('div');
                        div.className = 'value-display';
                        div.id = 'val-' + i;
                        div.style.color = COLORS[i % COLORS.length];
                        valueContainer.appendChild(div);
                    }
                }

                const type = filterTypeSelect.value;
                const param = parseFloat(filterParamInput.value) || 0;
                const paddingLeft = 60;
                const paddingRight = 20;
                const plotWidth = canvas.width - paddingLeft - paddingRight;
                let maxPoints = autoXCheck.checked ? Math.floor(plotWidth / 2) : parseInt(pointsXInput.value);
                if (maxPoints < 2) {
                    maxPoints = 2;
                }

                values.forEach((val, i) => {
                    if (i >= seriesData.length) {
                        return; // Should not happen with above init
                    }
                    
                    seriesRawBuffer[i].push(val);
                    if (seriesRawBuffer[i].length > 1000) {
                        seriesRawBuffer[i].splice(0, seriesRawBuffer[i].length - 1000);
                    }

                    let processedVal = val;
                    if (type === 'smooth') {
                        const taps = Math.max(1, Math.floor(param));
                        if (seriesRawBuffer[i].length >= taps) {
                            const slice = seriesRawBuffer[i].slice(-taps);
                            processedVal = slice.reduce((a, b) => a + b, 0) / taps;
                        }
                    } else if (type === 'lowpass') {
                        const alpha = Math.min(1, Math.max(0, param));
                        processedVal = alpha * val + (1 - alpha) * seriesLastFiltered[i];
                    } else if (type === 'highpass') {
                        const alpha = Math.min(1, Math.max(0, param));
                        processedVal = alpha * (seriesLastFiltered[i] + val - seriesLastRaw[i]);
                    }

                    seriesLastFiltered[i] = processedVal;
                    seriesLastRaw[i] = val;
                    seriesData[i].push(processedVal);
                    
                    if (seriesData[i].length > maxPoints) {
                        seriesData[i].splice(0, seriesData[i].length - maxPoints);
                    }
                    
                    const display = document.getElementById('val-' + i);
                    if (display) {
                        display.textContent = processedVal.toFixed(2);
                    }
                });

                if (isLogging) {
                    const timestamp = new Date().toISOString();
                    logBuffer += timestamp + ", " + values.join(", ") + "\\n";
                }
                
                draw();
            }
        });

        function draw() {
            const padding = { top: 20, right: 20, bottom: 30, left: 60 };
            const fullPlotWidth = canvas.width - padding.left - padding.right;
            const fullPlotHeight = canvas.height - padding.top - padding.bottom;

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            if (seriesData.length === 0 || seriesData[0].length < 1) {
                ctx.strokeStyle = '#444';
                ctx.beginPath();
                ctx.moveTo(padding.left, padding.top);
                ctx.lineTo(padding.left, canvas.height - padding.bottom);
                ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
                ctx.stroke();
                return;
            }

            const isSplit = splitViewCheck.checked;
            const numSeries = seriesData.length;
            const chartHeight = isSplit ? (fullPlotHeight / numSeries) : fullPlotHeight;

            // Global Y range (needed for Combined view)
            let globalMin = Infinity, globalMax = -Infinity;
            if (autoYCheck.checked) {
                seriesData.forEach(s => s.forEach(v => { if (v < globalMin) globalMin = v; if (v > globalMax) globalMax = v; }));
                if (globalMax === globalMin) { globalMin -= 5; globalMax += 5; }
                const yPadding = (globalMax - globalMin) * 0.15;
                globalMin -= yPadding;
                globalMax += yPadding;
            } else {
                globalMin = parseFloat(minYInput.value);
                globalMax = parseFloat(maxYInput.value);
            }

            seriesData.forEach((data, sIdx) => {
                const chartTop = padding.top + (isSplit ? (sIdx * chartHeight) : 0);
                const chartBottom = chartTop + chartHeight;
                
                let min = globalMin;
                let max = globalMax;

                if (isSplit && autoYCheck.checked) {
                    min = Math.min(...data);
                    max = Math.max(...data);
                    if (max === min) { min -= 5; max += 5; }
                    const yPadding = (max - min) * 0.15;
                    min -= yPadding;
                    max += yPadding;
                }
                
                const range = max - min;
                let maxPoints = autoXCheck.checked ? Math.floor(fullPlotWidth / 2) : parseInt(pointsXInput.value);
                if (maxPoints < 2) { maxPoints = 2; }

                // Grid and Axis Labels (Labels for each in Split, or first in Combined)
                ctx.font = isSplit ? '8px monospace' : '10px monospace';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                
                const yTicks = isSplit ? 3 : 5;
                for (let i = 0; i <= yTicks; i++) {
                    const val = min + (range * i / yTicks);
                    const y = chartBottom - (i / yTicks * chartHeight);
                    
                    if (showGridCheck.checked) {
                        ctx.strokeStyle = gridColorInput.value;
                        ctx.beginPath();
                        ctx.moveTo(padding.left, y);
                        ctx.lineTo(canvas.width - padding.right, y);
                        ctx.stroke();
                    }
                    if (isSplit || sIdx === 0) {
                        ctx.fillStyle = sIdx === 0 || isSplit ? '#aaa' : COLORS[sIdx % COLORS.length];
                        ctx.fillText(val.toFixed(2), padding.left - 8, y);
                    }
                }

                // Axis Lines
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(padding.left, chartTop);
                ctx.lineTo(padding.left, chartBottom);
                ctx.lineTo(canvas.width - padding.right, chartBottom);
                ctx.stroke();

                // Draw Data
                if (data.length > 0) {
                    const color = COLORS[sIdx % COLORS.length];
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    
                    for (let i = 0; i < data.length; i++) {
                        const x = padding.left + fullPlotWidth - ((data.length - 1 - i) / (maxPoints - 1)) * fullPlotWidth;
                        const normalized = (data[i] - min) / (range || 1);
                        const y = chartBottom - (normalized * chartHeight);
                        
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.stroke();

                    // Fill
                    if (data.length >= 2 && (sIdx === 0 || isSplit)) {
                        const firstX = padding.left + fullPlotWidth - ((data.length - 1) / (maxPoints - 1)) * fullPlotWidth;
                        const lastX = padding.left + fullPlotWidth;
                        ctx.lineTo(lastX, chartBottom);
                        ctx.lineTo(firstX, chartBottom);
                        ctx.closePath();
                        const gradient = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
                        const opacity = isSplit ? 0.1 : 0.15;
                        gradient.addColorStop(0, sIdx === 0 ? 'rgba(0, 255, 0, ' + opacity + ')' : 'rgba(255, 255, 255, 0.05)');
                        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                        ctx.fillStyle = gradient;
                        ctx.fill();
                    }
                }
            });

            // X Axis label at the bottom
            ctx.font = '10px monospace';
            ctx.fillStyle = '#aaa';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('Samples (last ' + seriesData[0].length + ')', padding.left + fullPlotWidth/2, canvas.height - padding.bottom + 10);
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
