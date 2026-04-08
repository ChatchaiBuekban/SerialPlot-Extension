import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Command startPlot should be registered', async () => {
		const extension = vscode.extensions.getExtension('nstda.serialplot-extension');
		if (extension) {
			await extension.activate();
		}
		const commands = await vscode.commands.getCommands(true);
		const filtered = commands.filter(c => c.startsWith('serialplot-extension'));
		console.log('Registered serialplot commands:', filtered);
		assert.ok(commands.includes('serialplot-extension.startPlot'));
	});

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});
