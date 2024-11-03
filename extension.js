const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class FavoritesProvider {
    constructor(context) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.favorites = new Map();
        this.groups = new Map();
        this.context = context;
        this.view = null;
        this.loadFavorites();
    }

    loadFavorites() {
        const favorites = this.context.globalState.get('favorites', []);
        favorites.forEach(item => {
            this.favorites.set(item.path, item);
        });
        
        const groups = this.context.globalState.get('favoriteGroups', {});
        Object.entries(groups).forEach(([groupName, items]) => {
            this.groups.set(groupName, new Map(items.map(item => [item.path, item])));
        });
    }

    saveFavorites() {
        const favoritesArray = Array.from(this.favorites.values());
        const groupsObject = {};
        this.groups.forEach((items, groupName) => {
            groupsObject[groupName] = Array.from(items.values());
        });
        
        this.context.globalState.update('favorites', favoritesArray);
        this.context.globalState.update('favoriteGroups', groupsObject);
    }

    getTreeItem(element) {
        if (element.isGroup) {
            const treeItem = new vscode.TreeItem(
                element.name,
                vscode.TreeItemCollapsibleState.Expanded
            );
            treeItem.contextValue = 'group';
            treeItem.iconPath = new vscode.ThemeIcon('folder');
            return treeItem;
        }

        const treeItem = new vscode.TreeItem(
            element.name,
            element.type === 'folder' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );
        
        if (element.type === 'file') {
            treeItem.command = {
                command: 'vscode-favorites.openFavoriteFile',
                arguments: [element],
                title: 'Open File'
            };
        }
        
        treeItem.iconPath = element.type === 'folder' ? new vscode.ThemeIcon('folder') : new vscode.ThemeIcon('file');
        treeItem.contextValue = element.type;
        return treeItem;
    }

    getChildren(element) {
        if (!element) {
            const defaultItems = Array.from(this.favorites.values());
            const groups = Array.from(this.groups.keys()).map(name => ({
                name,
                isGroup: true
            }));
            return [...defaultItems, ...groups];
        }
        
        if (element.isGroup) {
            const groupItems = this.groups.get(element.name);
            return groupItems ? Array.from(groupItems.values()) : [];
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

    async addToGroup(uri, groupName) {
        if (!groupName) {
            const result = await vscode.window.showInputBox({
                placeHolder: "Enter group name",
                prompt: "Enter a name for the favorite group"
            });
            if (!result) return;
            groupName = result;
        }

        if (!this.groups.has(groupName)) {
            this.groups.set(groupName, new Map());
        }

        const stat = fs.statSync(uri.fsPath);
        const favorite = {
            path: uri.fsPath,
            name: path.basename(uri.fsPath),
            type: stat.isDirectory() ? 'folder' : 'file'
        };

        this.groups.get(groupName).set(uri.fsPath, favorite);
        this.saveFavorites();
        this._onDidChangeTreeData.fire();
    }

    removeFromGroup(item, groupName) {
        if (this.groups.has(groupName)) {
            this.groups.get(groupName).delete(item.path);
            if (this.groups.get(groupName).size === 0) {
                this.groups.delete(groupName);
            }
            this.saveFavorites();
            this._onDidChangeTreeData.fire();
        }
    }

    setTreeView(view) {
        this.view = view;
    }

    getSelectedItems() {
        return this.view ? this.view.selection : [];
    }
}

function activate(context) {
    const favoritesProvider = new FavoritesProvider(context);
    
    const treeView = vscode.window.createTreeView('favoritesList', {
        treeDataProvider: favoritesProvider,
        canSelectMany: true
    });
    
    favoritesProvider.setTreeView(treeView);

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

    let openFavoriteFiles = vscode.commands.registerCommand('vscode-favorites.openFavoriteFiles', async () => {
        const selectedItems = favoritesProvider.getSelectedItems();
        for (const item of selectedItems) {
            if (item.type === 'file') {
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(item.path));
            }
        }
    });

    let openSelectedFiles = vscode.commands.registerCommand('vscode-favorites.openSelectedFiles', () => {
        const selectedItems = favoritesProvider.getSelectedItems();
        if (selectedItems) {
            selectedItems.forEach(item => {
                if (item.type === 'file') {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(item.path));
                }
            });
        }
    });

    let openFavoriteFile = vscode.commands.registerCommand('vscode-favorites.openFavoriteFile', (item) => {
        if (item && item.type === 'file') {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(item.path));
        }
    });

    let addToGroup = vscode.commands.registerCommand('vscode-favorites.addToGroup', async (uri) => {
        if (!uri) {
            uri = vscode.window.activeTextEditor?.document.uri;
        }
        if (uri) {
            await favoritesProvider.addToGroup(uri);
        }
    });

    let removeFromGroup = vscode.commands.registerCommand('vscode-favorites.removeFromGroup', (item, groupName) => {
        if (item && groupName) {
            favoritesProvider.removeFromGroup(item, groupName);
        }
    });

    context.subscriptions.push(
        treeView,
        addToFavorites,
        removeFromFavorites,
        openFavoriteFiles,
        openSelectedFiles,
        openFavoriteFile,
        addToGroup,
        removeFromGroup
    );
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
} 