const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class FavoritesProvider {
    constructor(context) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.favorites = new Map();
        this.context = context;
        this.loadFavorites();
    }

    loadFavorites() {
        const favorites = this.context.globalState.get('favorites', []);
        favorites.forEach(item => {
            this.favorites.set(item.path, item);
        });
    }

    saveFavorites() {
        const favoritesArray = Array.from(this.favorites.values());
        this.context.globalState.update('favorites', favoritesArray);
    }

    getTreeItem(element) {
        return {
            label: element.name,
            collapsible: element.type === 'folder' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            command: element.type === 'file' ? {
                command: 'vscode.open',
                arguments: [vscode.Uri.file(element.path)],
                title: 'Open File'
            } : undefined,
            iconPath: element.type === 'folder' ? new vscode.ThemeIcon('folder') : new vscode.ThemeIcon('file')
        };
    }

    getChildren(element) {
        if (!element) {
            return Array.from(this.favorites.values());
        }
        return [];
    }

    addFavorite(uri) {
        const stat = fs.statSync(uri.fsPath);
        const favorite = {
            path: uri.fsPath,
            name: path.basename(uri.fsPath),
            type: stat.isDirectory() ? 'folder' : 'file'
        };
        this.favorites.set(uri.fsPath, favorite);
        this.saveFavorites();
        this._onDidChangeTreeData.fire();
    }

    removeFavorite(item) {
        this.favorites.delete(item.path);
        this.saveFavorites();
        this._onDidChangeTreeData.fire();
    }
}

function activate(context) {
    const favoritesProvider = new FavoritesProvider(context);
    vscode.window.registerTreeDataProvider('favoritesList', favoritesProvider);

    let addToFavorites = vscode.commands.registerCommand('vscode-favorites.addToFavorites', (uri) => {
        if (!uri) {
            uri = vscode.window.activeTextEditor?.document.uri;
        }
        if (uri) {
            favoritesProvider.addFavorite(uri);
        }
    });

    let removeFromFavorites = vscode.commands.registerCommand('vscode-favorites.removeFromFavorites', (item) => {
        if (item) {
            favoritesProvider.removeFavorite(item);
        }
    });

    context.subscriptions.push(addToFavorites, removeFromFavorites);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
} 