/**
 * VS Code 扩展开发的重要概念：
 * 
 * 1. 扩展生命周期
 *    - activate: 扩展被激活时调用（首次使用相关功能时）
 *    - deactivate: 扩展被停用时调用（VS Code 关闭或扩展被禁用时）
 * 
 * 2. ExtensionContext
 *    - subscriptions: 用于注册需要清理的资源
 *    - globalState: 持久化存储，在 VS Code 重启后仍然存在
 *    - workspaceState: 工作区级别的存储
 * 
 * 3. TreeView API
 *    - TreeDataProvider: 提供树视图数据的接口
 *      - getTreeItem: 定义每个节点的外观和行为
 *      - getChildren: 定义树的层级结构
 *    - TreeItem: 树节点的配置对象
 *      - label: 显示的文本
 *      - contextValue: 用于 when 子句的类型标识
 *      - iconPath: 图标
 *      - command: 点击时执行的命令
 *      - resourceUri: 关联的文件路径
 *      - collapsibleState: 是否可展开/折叠
 * 
 * 4. 命令系统
 *    - registerCommand: 注册命令
 *    - executeCommand: 执行命令
 *    - 命令可以有参数，参数会传递给处理函数
 * 
 * 5. 用户界面 API
 *    - window.showInputBox: 显示输入框
 *    - window.showQuickPick: 显示快速选择列表
 *    - window.showWarningMessage: 显示警告消息
 * 
 * 6. 事件系统
 *    - EventEmitter: 用于发出事件
 *    - Event: 订阅事件的接口
 *    - 常用于通知 UI 更新
 * 
 * 7. 文件系统 API
 *    - Uri: 统一资源标识符，用于标识文件
 *    - workspace.fs: 文件系统操作
 *    - path/fs: Node.js 的文件操作模块
 * 
 * 8. 拖放系统
 *    - DataTransfer: 数据传输对象
 *    - DataTransferItem: 单个传输项
 *    - MIME 类型: 定义数据格式
 */

/**
 * VS Code 的常用设计模式：
 * 
 * 1. 命令模式
 *    - 所有用户操作都通过命令系统
 *    - 命令可以被菜单项、快捷键触发
 *    - 命令可以被程序调用
 * 
 * 2. 发布-订阅模式
 *    - 使用 EventEmitter 发出事件
 *    - 使用 Event 订阅事件
 *    - 用于组件间通信
 * 
 * 3. 提供者模式
 *    - TreeDataProvider 提供数据
 *    - VS Code 负责显示
 *    - 分离数据和显示
 */

/**
 * 扩展开发的最佳实践：
 * 
 * 1. 性能考虑
 *    - 按需激活扩展
 *    - 避免不必要的 UI 更新
 *    - 大量数据使用分页或虚拟化
 * 
 * 2. 用户体验
 *    - 提供清晰的错误信息
 *    - 危险操作要确认
 *    - 支持键盘操作
 * 
 * 3. 代码组织
 *    - 关注点分离
 *    - 模块化设计
 *    - 清晰的注释
 * 
 * 4. 调试技巧
 *    - 使用 console.log 输出信息
 *    - 在 launch.json 中配置调试
 *    - 使用 VS Code 的开发者工具
 */

// 删除重复的导入，只保留一个
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

type TreeItemWithButtons = vscode.TreeItem & {
    buttons?: {
        icon: vscode.ThemeIcon;
        tooltip: string;
        command: {
            command: string;
            arguments: any[];
            title: string;
        };
    }[];
};

// 定义 QuickPickItem 的扩展接口
interface GroupQuickPickItem extends vscode.QuickPickItem {
    group: boolean;
}

// 定义接口
interface FavoriteItem {
    path: string;
    name: string;
    type: 'file' | 'folder';
    groupName?: string;
    isGroup?: boolean;
    contextValue?: string;
    parentGroup?: string;
}

interface GroupData {
    files: Map<string, FavoriteItem>;
    subGroups: Map<string, boolean>;
    parentGroup: string | null;
}

// 添加 JSON 数据的接口定义
interface JsonGroupData {
    files?: Array<{
        path: string;
        name: string;
        type: 'file' | 'folder';
    }>;
    parentGroup?: string | null;
}

interface JsonData {
    favorites: FavoriteItem[];
    groups: Record<string, JsonGroupData>;
    activeGroup: string | null;
}

// 在其他接口定义的地方添加这个接口
interface HistorySnapshot {
    type: string;
    data: any;
    favorites: Map<string, FavoriteItem>;
    groups: Map<string, GroupData>;
    activeGroup: string | null;
    timestamp: string;
}

// 1. 添加 SaveData 接口定义
interface SaveData {
    favorites: Omit<FavoriteItem, 'groupName'>[]; // 移除 groupName
    groups: Record<string, {
        files: string[];  // 只存储文件路径
        parentGroup: string | null;
    }>;
    activeGroup: string | null;
}

/**
 * FavoritesProvider 类实现了 VS Code 的 TreeDataProvider 接口
 * 用于在侧边栏显示树形结构的收藏夹视图
 */
class FavoritesProvider implements vscode.TreeDataProvider<FavoriteItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FavoriteItem | undefined | null | void>;
    readonly onDidChangeTreeData: vscode.Event<FavoriteItem | undefined | null | void>;
    private favorites: Map<string, FavoriteItem>;
    private groups: Map<string, GroupData>;
    private view: vscode.TreeView<FavoriteItem> | null;
    private activeGroup: string | null;
    private history: HistorySnapshot[];
    private maxHistorySize: number;

    constructor(_context: vscode.ExtensionContext) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.favorites = new Map();
        this.groups = new Map();
        this.view = null;
        this.activeGroup = null;
        this.history = [];
        this.maxHistorySize = 50;

        this.loadFavorites();
    }

    /**
     * 从项目的 .vscode/favor.json 中加载收藏数据
     */
    loadFavorites() {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                console.log('No workspace folder found');
                return;
            }

            const favorPath = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'favor.json');
            
            try {
                const content = fs.readFileSync(favorPath.fsPath, 'utf8');
                const data = JSON.parse(content) as JsonData;
                
                // 加载默认分组的文件
                const favorites = data.favorites || [];
                favorites.forEach(item => {
                    this.favorites.set(item.path, item);
                });
                
                // 加载分组数据
                const groups = data.groups || {};
                Object.entries(groups).forEach(([groupName, group]) => {
                    const files = new Map<string, FavoriteItem>();
                    group.files?.forEach(filePath => {
                        if (typeof filePath === 'string') {
                            // 从文件路径创建文件项
                            const item: FavoriteItem = {
                                path: filePath,
                                name: path.basename(filePath),
                                type: 'file'
                            };
                            files.set(filePath, item);
                        }
                    });

                    this.groups.set(groupName, {
                        files,
                        subGroups: new Map(),
                        parentGroup: group.parentGroup || null
                    });
                });

                this.activeGroup = data.activeGroup || null;

            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    console.error('Error loading favorites:', error);
                }
            }
        } catch (error) {
            console.error('Error in loadFavorites:', error);
        }
    }

    /**
     * 保存数据到项目的 .vscode/favor.json
     */
    saveFavorites() {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                console.log('No workspace folder found');
                return;
            }

            const vscodePath = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode');
            const favorPath = vscode.Uri.joinPath(vscodePath, 'favor.json');

            if (!fs.existsSync(vscodePath.fsPath)) {
                fs.mkdirSync(vscodePath.fsPath, { recursive: true });
            }

            // 准备要保存的数据
            const data: SaveData = {
                favorites: Array.from(this.favorites.values()).map(item => {
                    const { groupName, ...rest } = item;
                    return rest;
                }),
                groups: {},
                activeGroup: this.activeGroup
            };

            // 转换分组数据
            this.groups.forEach((group, groupName) => {
                data.groups[groupName] = {
                    files: Array.from(group.files.keys()), // 只保存文件路径
                    parentGroup: group.parentGroup
                };
            });

            fs.writeFileSync(favorPath.fsPath, JSON.stringify(data, null, 2), 'utf8');
            console.log('Favorites saved to:', favorPath.fsPath);

        } catch (error) {
            if (error instanceof Error) {
                console.error('Error saving favorites:', error);
                vscode.window.showErrorMessage(`Failed to save favorites: ${error.message}`);
            }
        }
    }

    /**
     * 创建树视图项，用于显示文件和分组
     * 这是 VS Code TreeDataProvider 接口的核心方法之一
     * 用于定义每个树节点的外观和行为
     * @param {Object} element - 要显示的元素（文件或分组）
     */
    getTreeItem(element: FavoriteItem): vscode.TreeItem {
        if (element.isGroup) {
            const group = this.groups.get(element.name);
            if (!group) return new vscode.TreeItem(element.name);

            const fileCount = group.files.size;
            const subGroupCount = Array.from(this.groups.values())
                .filter(g => g.parentGroup === element.name).length;
            
            const isActive = element.name === this.activeGroup;
            const label = subGroupCount > 0 ? 
                `${element.name} (${fileCount} files, ${subGroupCount} groups)` : 
                `${element.name} (${fileCount} files)`;
            
            // 创建分组的树节点
            const treeItem = new vscode.TreeItem(
                label,
                vscode.TreeItemCollapsibleState.Expanded  // 默认展开分组
            ) as TreeItemWithButtons;  // 使用类型断言
            
            // contextValue 用于在 package.json 中的 when 子句中判断节点类型
            treeItem.contextValue = isActive ? 'activeGroup' : 'group';
            
            // 使用不同的图标颜色来区分活分组
            treeItem.iconPath = new vscode.ThemeIcon(
                isActive ? 'folder-active' : 'folder-opened',  // 使用不同的文件夹图标
                isActive ? new vscode.ThemeColor('notificationsWarningIcon.foreground') : undefined  // 使用警告色
            );
            
            // 添加分组的操作按钮
            treeItem.buttons = [
                // 激活/取消激活钮
                {
                    icon: new vscode.ThemeIcon(isActive ? 'circle-filled' : 'circle-outline'),
                    tooltip: isActive ? 'Deactivate Group' : 'Set as Active Group',
                    command: {
                        command: isActive ? 'vscode-favorites.deactivateGroup' : 'vscode-favorites.setActiveGroup',
                        arguments: [element],
                        title: isActive ? 'Deactivate Group' : 'Set as Active Group'
                    }
                },
                // 创建子分组按钮
                {
                    icon: new vscode.ThemeIcon('new-folder'),
                    tooltip: 'Create Sub-Group',
                    command: {
                        command: 'vscode-favorites.addNewSubGroup',
                        arguments: [element],
                        title: 'Create Sub-Group'
                    }
                },
                // 重命名按钮
                {
                    icon: new vscode.ThemeIcon('edit'),
                    tooltip: 'Rename Group',
                    command: {
                        command: 'vscode-favorites.renameGroup',
                        arguments: [element],
                        title: 'Rename Group'
                    }
                },
                // 删除按钮
                {
                    icon: new vscode.ThemeIcon('trash'),
                    tooltip: 'Delete Group',
                    command: {
                        command: 'vscode-favorites.deleteGroup',
                        arguments: [element],
                        title: 'Delete Group'
                    }
                }
            ];
            
            return treeItem;
        }

        // 处理文件节点
        const treeItem = new vscode.TreeItem(
            element.name,
            element.type === 'folder' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        ) as TreeItemWithButtons;  // 使用类型断言
        
        if (element.type === 'file') {
            // 设置文件点击时的命令（打开文件）
            treeItem.command = {
                command: 'vscode-favorites.openFavoriteFile',
                arguments: [element],
                title: 'Open File'
            };
            // 设置文件的 URI，用于文件操作和拖拽
            treeItem.resourceUri = vscode.Uri.file(element.path);
            
            // 根据文件扩展名设置不同的图标
            const ext = path.extname(element.path).toLowerCase();
            if (ext === '.ts') {
                treeItem.iconPath = new vscode.ThemeIcon('symbol-type-parameter');
            } else if (ext === '.tsx') {
                treeItem.iconPath = new vscode.ThemeIcon('react');
            } else {
                treeItem.iconPath = new vscode.ThemeIcon('file');
            }
        } else {
            treeItem.iconPath = new vscode.ThemeIcon('folder');
        }
        
        treeItem.contextValue = element.type;

        // 为文件添加删除按钮
        if (!element.isGroup) {
            treeItem.buttons = [
                {
                    icon: new vscode.ThemeIcon('trash'),
                    tooltip: 'Remove from Favorites',
                    command: {
                        command: 'vscode-favorites.removeFromFavorites',
                        arguments: [element],
                        title: 'Remove from Favorites'
                    }
                }
            ];
        }

        return treeItem;
    }

    /**
     * 获取树节点的子项
     * 这是 VS Code TreeDataProvider 接口的另一个核心方法
     * 用于定义树的层级结构
     * @param {Object} element - 父节点元素，如果是 undefined 则表示根节点
     * @returns {Array} 子节点数组
     */
    getChildren(element?: FavoriteItem): FavoriteItem[] {
        if (!element) {
            // 根级别：显示默认收藏和顶级分组
            const defaultItems = Array.from(this.favorites.values());
            const topGroups = Array.from(this.groups.entries())
                .filter(([_, group]) => !group.parentGroup)
                .map(([name]): FavoriteItem => ({
                    name,
                    path: '', // 分组不需要实际路径
                    type: 'folder',
                    isGroup: true
                }));
            return [...topGroups, ...defaultItems];
        }
        
        if (element.isGroup) {
            const group = this.groups.get(element.name);
            if (!group) return [];

            // 获取子分组
            const subGroups = Array.from(this.groups.entries())
                .filter(([_, g]) => g.parentGroup === element.name)
                .map(([name]): FavoriteItem => ({
                    name,
                    path: '', // 分组不需要实际路径
                    type: 'folder',
                    isGroup: true,
                    parentGroup: element.name
                }));
            
            // 获取分组内的文件
            const files = Array.from(group.files.values()).map(item => ({
                ...item,
                groupName: element.name,
                contextValue: 'file'
            }));

            return [...subGroups, ...files];
        }
        
        return [];
    }

    async addFavorite(uri: vscode.Uri) {
        try {
            this.saveToHistory('add', { path: uri.fsPath });
            const stat = fs.statSync(uri.fsPath);
            
            if (stat.isDirectory()) {
                try {
                    const files = await this.getAllFilesInDirectory(uri.fsPath);
                    console.log('\n### > Found files in directory:', files);
                    
                    files.forEach(filePath => {
                        const favorite: FavoriteItem = {
                            path: filePath,
                            name: path.basename(filePath),
                            type: 'file'  // 明确指定类型为 'file'
                        };

                        if (this.activeGroup && this.groups.has(this.activeGroup)) {
                            const group = this.groups.get(this.activeGroup);
                            if (group) {
                                favorite.groupName = this.activeGroup;
                                group.files.set(filePath, favorite);
                            }
                        } else {
                            this.favorites.set(filePath, favorite);
                        }
                    });
                } catch (error) {
                    if (error instanceof Error) {
                        console.error('Error reading directory:', error);
                        vscode.window.showErrorMessage(`Failed to add directory: ${error.message}`);
                    }
                }
            } else {
                const favorite: FavoriteItem = {
                    path: uri.fsPath,
                    name: path.basename(uri.fsPath),
                    type: 'file'  // 明确指定类型为 'file'
                };

                if (this.activeGroup && this.groups.has(this.activeGroup)) {
                    const group = this.groups.get(this.activeGroup);
                    if (group) {
                        favorite.groupName = this.activeGroup;
                        group.files.set(uri.fsPath, favorite);
                    }
                } else {
                    this.favorites.set(uri.fsPath, favorite);
                }
            }

            this.saveFavorites();
            this._onDidChangeTreeData.fire();
        } catch (error) {
            if (error instanceof Error) {
                console.error('Error reading directory:', error);
                vscode.window.showErrorMessage(`Failed to add directory: ${error.message}`);
            }
        }
    }

    /**
     * 递归获取目录下的所有文件
     * @param {string} dirPath - 目录路径
     * @returns {Promise<string[]>} 文件路径数组
     */
    async getAllFilesInDirectory(dirPath: string): Promise<string[]> {
        const files: string[] = [];
        
        // 读取目录内容
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.name.startsWith('.')) {
                continue;
            }

            if (entry.isDirectory()) {
                const subFiles = await this.getAllFilesInDirectory(fullPath);
                files.push(...subFiles);
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
                    files.push(fullPath);
                }
            }
        }
        
        return files;
    }

    removeFavorite(item: FavoriteItem) {
        this.saveToHistory('remove', item);
        if (item.groupName) {
            const group = this.groups.get(item.groupName);
            if (group) {
                group.files.delete(item.path);
                if (group.files.size === 0) {
                    this.groups.delete(item.groupName);
                }
            }
        } else {
            this.favorites.delete(item.path);
        }
        this.saveFavorites();
        this._onDidChangeTreeData.fire();
    }

    getGroups() {
        return Array.from(this.groups.keys());
    }

    async addToGroup(uri: vscode.Uri, groupName?: string): Promise<void> {
        if (!groupName) {
            const groups = this.getGroups();
            const items: (GroupQuickPickItem | { kind: vscode.QuickPickItemKind })[] = [];
            
            groups.forEach(group => {
                items.push({
                    label: group,
                    group: true
                } as GroupQuickPickItem);
            });

            if (groups.length > 0) {
                items.push({ kind: vscode.QuickPickItemKind.Separator });
            }
            items.push({
                label: "New Group...",
                group: false
            } as GroupQuickPickItem);

            const selected = await vscode.window.showQuickPick(
                items.filter((item): item is GroupQuickPickItem => !('kind' in item)),
                { placeHolder: 'Select or create a group' }
            );

            if (!selected) return;

            if (!selected.group) {
                const newGroupName = await vscode.window.showInputBox({
                    placeHolder: "Enter group name",
                    prompt: "Enter a name for the new favorite group",
                    validateInput: value => {
                        if (!value) return 'Group name cannot be empty';
                        if (this.groups.has(value)) {
                            return 'Group name already exists';
                        }
                        return null;
                    }
                });
                if (!newGroupName) return;
                groupName = newGroupName;
            } else {
                groupName = selected.label;
            }
        }

        if (!this.groups.has(groupName)) {
            this.groups.set(groupName, {
                files: new Map(),
                subGroups: new Map(),
                parentGroup: null
            });
        }

        const stat = fs.statSync(uri.fsPath);
        const favorite: FavoriteItem = {
            path: uri.fsPath,
            name: path.basename(uri.fsPath),
            type: stat.isDirectory() ? 'folder' : 'file',
            groupName: groupName
        };

        const group = this.groups.get(groupName);
        if (group) {
            group.files.set(uri.fsPath, favorite);
        }
        
        this.saveFavorites();
        this._onDidChangeTreeData.fire();
    }

    removeFromGroup(item: FavoriteItem, groupName: string) {
        if (this.groups.has(groupName)) {
            const group = this.groups.get(groupName);
            if (group) {
                group.files.delete(item.path);
                if (group.files.size === 0) {
                    this.groups.delete(groupName);
                }
                this.saveFavorites();
                this._onDidChangeTreeData.fire();
            }
        }
    }

    setTreeView(view: vscode.TreeView<FavoriteItem>): void {
        this.view = view;
    }

    getSelectedItems() {
        return this.view ? this.view.selection : [];
    }

    async getDragUri(item: FavoriteItem): Promise<vscode.Uri | vscode.Uri[]> {
        if (item.isGroup) {
            const group = this.groups.get(item.name);
            if (!group) return [];

            const filteredItems = Array.from(group.files.values())
                .filter((item): item is FavoriteItem => item.type === 'file');
            
            return filteredItems.map(item => vscode.Uri.file(item.path));
        }
        
        return vscode.Uri.file(item.path);
    }

    /**
     * 处理拖拽操作
     * VS Code 的拖拽系统会在拖拽开始时调用此方法
     * @param {Array} items - 被拖拽的项目数组
     * @param {DataTransfer} dataTransfer - VS Code 提供的数据传输对象
     * @param {CancellationToken} token - 用于检测修饰键（如 Cmd/Ctrl）的状态
     */
    async handleDrag(items: FavoriteItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken) {
        console.log('\n=== handleDrag Start ===');
        console.log('Input items:', JSON.stringify(items, null, 2));
        
        try {
            // 设置拖拽数据，包含项目信息和操作类型（复制/移动）
            const dragData = {
                items: items,
                isCopy: false  // 默认为移动操作
            };

            // 检查是否按下了修饰键（Cmd/Ctrl
            // 在 macOS 上使用 Cmd，在其他平台使用 Ctrl
            if (process.platform === 'darwin') {
                dragData.isCopy = token.isCancellationRequested;
                console.log('macOS: Command key state:', dragData.isCopy);
            } else {
                dragData.isCopy = token.isCancellationRequested;
                console.log('Windows/Linux: Ctrl key state:', dragData.isCopy);
            }

            console.log('Prepared drag data:', JSON.stringify(dragData, null, 2));
            
            // 设置拖拽数据到 DataTransfer 对象
            // 使用自定义的 MIME 类型来标识数据
            const transferItem = new vscode.DataTransferItem(dragData);
            dataTransfer.set('application/vnd.code.tree.favoritesList', transferItem);
            console.log('Set favoritesList data');
            
            // 设置拖拽效果（复制/移动）
            dataTransfer.set('vscode-drag-effect', new vscode.DataTransferItem(dragData.isCopy ? 'copy' : 'move'));
            console.log('Set drag effect:', dragData.isCopy ? 'copy' : 'move');
        } catch (error) {
            if (error instanceof Error) {
                console.error('Error in handleDrag:', error);
                console.error('Error details:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                });
            }
        }
        console.log('=== handleDrag End ===\n');
    }

    async handleDrop(target: FavoriteItem | undefined, dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken) {
        if (!target) return;
        console.log('\n=== handleDrop Start ===');
        console.log('Target:', JSON.stringify(target, null, 2));
        
        try {
            // 直接从 dataTransfer 获取数据
            const transferItem = dataTransfer.get('application/vnd.code.tree.favoritesList');
            console.log('Transfer item:', transferItem ? 'found' : 'not found');
            
            if (!transferItem) {
                console.log('No transfer item found');
                return;
            }

            const dragData = transferItem.value;
            console.log('Drag data:', JSON.stringify(dragData, null, 2));

            const items = dragData.items;
            const isCopy = dragData.isCopy;
            console.log('Processing items:', JSON.stringify(items, null, 2));
            console.log('Operation type:', isCopy ? 'copy' : 'move');

            if (target && target.isGroup) {
                console.log('Dropping into group:', target.name);
                for (const source of items) {
                    if (source.type === 'file') {
                        console.log('Processing file:', source.path);
                        const newItem: FavoriteItem = { ...source, groupName: target.name };
                        
                        if (!isCopy) {
                            if (source.groupName) {
                                console.log('Removing from source group:', source.groupName);
                                const sourceGroup = this.groups.get(source.groupName);
                                if (sourceGroup) {
                                    sourceGroup.files.delete(source.path);
                                }
                            } else {
                                console.log('Removing from default group');
                                this.favorites.delete(source.path);
                            }
                        }

                        if (!this.groups.has(target.name)) {
                            console.log('Creating new group:', target.name);
                            this.groups.set(target.name, {
                                files: new Map(),
                                subGroups: new Map(),
                                parentGroup: null
                            });
                        }

                        const targetGroup = this.groups.get(target.name);
                        if (targetGroup) {
                            console.log('Adding to target group:', target.name);
                            targetGroup.files.set(source.path, newItem);
                        }
                    }
                }
            }
            // 如目标默认分区域
            else if (!target) {
                console.log('Dropping into default group');
                for (const source of items) {
                    if (source.type === 'file' && source.groupName) {
                        console.log('Processing file:', source.path);
                        // 创建
                        const newItem = { ...source };
                        delete newItem.groupName;
                        
                        // 如果不是复制操作，从原分组移除
                        if (!isCopy) {
                            console.log('Removing from source group:', source.groupName);
                            const sourceGroup = this.groups.get(source.groupName);
                            if (sourceGroup) {
                                sourceGroup.files.delete(source.path);
                            }
                        }
                        
                        console.log('Adding to default group');
                        this.favorites.set(source.path, newItem);
                    }
                }
            }

            this.saveFavorites();
            this._onDidChangeTreeData.fire();
            console.log('Operation completed successfully');
            
        } catch (error) {
            if (error instanceof Error) {
                console.error('Error in handleDrop:', error);
                console.error('Error details:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                });
            }
        }
        console.log('=== handleDrop End ===\n');
    }

    async renameGroup(groupElement: FavoriteItem) {
        if (groupElement && groupElement.isGroup) {
            const newName = await vscode.window.showInputBox({
                prompt: 'Enter new group name',
                value: groupElement.name,
                validateInput: value => {
                    if (!value) return 'Group name cannot be empty';
                    if (this.groups.has(value) && value !== groupElement.name) {
                        return 'Group name already exists';
                    }
                    return null;
                }
            });

            if (newName && newName !== groupElement.name) {
                const groupItems = this.groups.get(groupElement.name);
                if (groupItems) {
                    // 创建新组并复制内容
                    this.groups.set(newName, groupItems);
                    // 删除旧组
                    this.groups.delete(groupElement.name);
                    // 更新所有文件的 groupName
                    groupItems.files.forEach(item => {
                        item.groupName = newName;
                    });
                    // 保存并刷新视图
                    this.saveFavorites();
                    this._onDidChangeTreeData.fire();
                }
            }
        }
    }

    async deleteGroup(groupElement: FavoriteItem) {
        this.saveToHistory('deleteGroup', groupElement);
        console.log('\n### > deleteGroup:', JSON.stringify(groupElement, null, 2));
        if (groupElement && groupElement.isGroup) {
            const group = this.groups.get(groupElement.name);
            if (group) {
                // 删除该分组
                this.groups.delete(groupElement.name);
                
                // 如果有父分组，从父分组的 subGroups 中移除该分组
                if (group.parentGroup) {
                    const parentGroup = this.groups.get(group.parentGroup);
                    if (parentGroup && parentGroup.subGroups) {
                        parentGroup.subGroups.delete(groupElement.name);
                    }
                }

                // 递归删除所有子分组
                const deleteSubGroups = (subGroups: Map<string, boolean>) => {
                    if (!subGroups) return;
                    for (const [subGroupName] of subGroups) {
                        const subGroup = this.groups.get(subGroupName);
                        if (subGroup) {
                            deleteSubGroups(subGroup.subGroups);
                            this.groups.delete(subGroupName);
                        }
                    }
                };

                // 删除所有子分组
                deleteSubGroups(group.subGroups);

                this.saveFavorites();
                this._onDidChangeTreeData.fire();
            }
        }
    }

    async addNewGroup(parentGroup?: FavoriteItem | null) {
        console.log('\n### > addNewGroup start with parent:', JSON.stringify(parentGroup, null, 2));
        const groupName = await vscode.window.showInputBox({
            prompt: 'Enter new group name',
            validateInput: value => {
                if (!value) return 'Group name cannot be empty';
                if (this.groups.has(value)) {
                    return 'Group name already exists';
                }
                return null;
            }
        });

        if (groupName) {
            console.log('\n### > Creating new group:', groupName);
            // 建的空分组，包含完整数据结构
            this.groups.set(groupName, {
                files: new Map(),          // 存储文件
                subGroups: new Map(),      // 存储子分组
                parentGroup: parentGroup ? parentGroup.name : null  // 存储父分组引用
            });
            
            // 如果有父分组，将新分组添加到父分组的 subGroups 中
            if (parentGroup) {
                const parent = this.groups.get(parentGroup.name);
                if (parent) {
                    parent.subGroups.set(groupName, true);
                }
            }

            this.saveFavorites();
            this._onDidChangeTreeData.fire();
        }
        console.log('\n### > addNewGroup end');
    }

    // 添加一个辅助方法来获取组的完整路径
    getGroupFullPath(groupName: string): string {
        const group = this.groups.get(groupName);
        if (!group) return groupName;

        let path = groupName;
        let current = group;
        while (current.parentGroup) {
            path = `${current.parentGroup} > ${path}`;
            const parentGroup = this.groups.get(current.parentGroup);
            if (!parentGroup) break;
            current = parentGroup;
        }
        return path;
    }

    // 添一个辅助方法来获取所有分组（包括完整路径）
    getAllGroupsWithPath() {
        const groups = ['(Default Group)'];
        this.groups.forEach((_, groupName) => {
            groups.push(this.getGroupFullPath(groupName));
        });
        return groups;
    }

    async moveToGroup(item: FavoriteItem, targetGroup?: string): Promise<void> {
        if (!targetGroup) {
            const selectedItems = item ? 
                [item, ...this.view!.selection.filter(i => i !== item)] : 
                this.view!.selection;

            if (selectedItems && selectedItems.length > 0) {
                const firstItem = selectedItems[0];
                if (!firstItem) return;

                const currentGroup = firstItem.groupName || '';
                const allSameGroup = selectedItems.every(item => item.groupName === currentGroup);
                const availableGroups = this.getAllGroupsWithPath();
                const filteredGroups = allSameGroup && currentGroup ? 
                    availableGroups.filter(g => !g.endsWith(currentGroup)) : 
                    availableGroups;
                
                const targetGroupPath = await vscode.window.showQuickPick(filteredGroups, {
                    placeHolder: 'Select target group'
                });

                if (targetGroupPath) {
                    const finalTargetGroup = targetGroupPath === '(Default Group)' ? 
                        targetGroupPath : 
                        targetGroupPath.split(' > ').pop() || '';

                    // 移动所有选中的项目
                    for (const item of selectedItems) {
                        if (finalTargetGroup === '(Default Group)') {
                            // 移动到认分组
                            if (item.groupName) {
                                const group = this.groups.get(item.groupName);
                                if (group) {
                                    group.files.delete(item.path);
                                }
                            }
                            delete item.groupName;
                            this.favorites.set(item.path, item);
                        } else {
                            // 移动指定分组
                            if (item.groupName) {
                                const group = this.groups.get(item.groupName);
                                if (group) {
                                    group.files.delete(item.path);
                                }
                            } else {
                                this.favorites.delete(item.path);
                            }
                            item.groupName = finalTargetGroup;
                            if (!this.groups.has(finalTargetGroup)) {
                                this.groups.set(finalTargetGroup, {
                                    files: new Map(),
                                    subGroups: new Map(),
                                    parentGroup: null
                                });
                            }
                            this.groups.get(finalTargetGroup)?.files.set(item.path, item);
                        }
                    }
                    this.saveFavorites();
                    this._onDidChangeTreeData.fire();
                }
            }
        }
    }

    async copyToGroup(item: FavoriteItem, targetGroup?: string): Promise<void> {
        if (!targetGroup) {
            const selectedItems = item ? 
                [item, ...this.view!.selection.filter(i => i !== item)] : 
                this.view!.selection;

            if (selectedItems && selectedItems.length > 0) {
                const firstItem = selectedItems[0];
                if (!firstItem) return;

                const currentGroup = firstItem.groupName;
                const allSameGroup = selectedItems.every(item => item.groupName === currentGroup);
                const availableGroups = this.getAllGroupsWithPath();
                const filteredGroups = allSameGroup && currentGroup ? 
                    availableGroups.filter(g => !g.endsWith(currentGroup)) : 
                    availableGroups;
                
                const targetGroupPath = await vscode.window.showQuickPick(filteredGroups, {
                    placeHolder: 'Select target group'
                });

                if (targetGroupPath) {
                    const finalTargetGroup = targetGroupPath === '(Default Group)' ? 
                        targetGroupPath : 
                        targetGroupPath.split(' > ').pop() || '';

                    // 复制所有选中的项目
                    for (const item of selectedItems) {
                        const newItem = { ...item };
                        if (finalTargetGroup === '(Default Group)') {
                            delete newItem.groupName;
                            this.favorites.set(newItem.path, newItem);
                        } else {
                            newItem.groupName = finalTargetGroup;
                            // 确保目标分组存在且有正确的数据结构
                            if (!this.groups.has(finalTargetGroup)) {
                                this.groups.set(finalTargetGroup, {
                                    files: new Map(),
                                    subGroups: new Map(),
                                    parentGroup: null
                                });
                            }
                            // 使用 files Map 来存储文件
                            this.groups.get(finalTargetGroup)?.files.set(newItem.path, newItem);
                        }
                    }
                    this.saveFavorites();
                    this._onDidChangeTreeData.fire();
                }
            }
        }
    }

    async removeAll() {
        this.saveToHistory('removeAll', {});
        // 检查是否有何收藏
        if (this.favorites.size === 0 && this.groups.size === 0) {
            vscode.window.showInformationMessage('No favorites to remove.');
            return;
        }

        // 直接清空所有收藏
        this.favorites.clear();
        this.groups.clear();
        this.saveFavorites();
        this._onDidChangeTreeData.fire();
    }

    // 设置激活分组
    setActiveGroup(groupName: string | null) {
        this.activeGroup = groupName;
        this.saveFavorites();
        this._onDidChangeTreeData.fire();
    }

    /**
     * 存操作到历史记录
     * @param {string} type - 操作类型
     * @param {Object} data - 操作相关的数据
     */
    saveToHistory(type: string, data: any) {
        const snapshot: HistorySnapshot = {
            type,
            data,
            favorites: new Map(this.favorites),
            groups: new Map(this.groups),
            activeGroup: this.activeGroup,
            timestamp: new Date().toISOString()
        };
        
        this.history.push(snapshot);
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }

    /**
     * 撤销上一次操作
     */
    async undo() {
        if (this.history.length === 0) {
            vscode.window.showInformationMessage('No operations to undo');
            return;
        }

        const lastOperation = this.history[this.history.length - 1];
        if (!lastOperation) return;
        
        this.favorites = new Map(lastOperation.favorites);
        this.groups = new Map(lastOperation.groups);
        this.activeGroup = lastOperation.activeGroup;
        
        this.history.pop();
        this.saveFavorites();
        this._onDidChangeTreeData.fire();
    }

    // 添加 hasGroup 公共方法
    public hasGroup(groupName: string): boolean {
        return this.groups.has(groupName);
    }

}

/**
 * VS Code 扩展的激活函数
 * 当展被激活时（比如第一次使用相关命时），VS Code 会调用这个函数
 * @param {vscode.ExtensionContext} context - VS Code 提供的扩展上下文
 */
export function activate(context: vscode.ExtensionContext) {
    // 创建收藏夹提供者实例
    const favoritesProvider = new FavoritesProvider(context);
    
    /**
     * 建树视图
     * treeDataProvider: 提供树视图数据的对象
     * canSelectMany: 是否允许多选
     * dragAndDropController: 处理拖放操作的控制器
     *   - dropMimeTypes: 可以接受的数据类型
     *   - dragMimeTypes: 可以提供的数据类型
     *   - handleDrag/handleDrop: 处拖放的回调函数
     */
    const treeView = vscode.window.createTreeView('favoritesList', {
        treeDataProvider: favoritesProvider,
        canSelectMany: true,
        dragAndDropController: {
            dropMimeTypes: ['application/vnd.code.tree.favoritesList'],
            dragMimeTypes: ['application/vnd.code.tree.favoritesList'],
            handleDrag: (items: readonly FavoriteItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken) => 
                favoritesProvider.handleDrag([...items], dataTransfer, token),  // 转换为可变数组
            handleDrop: (target: FavoriteItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken) => 
                favoritesProvider.handleDrop(target, dataTransfer, token)  // 移除 || null
        }
    });
    
    // 将 TreeView 实例传给 Provider，用于获取选中项等信息
    favoritesProvider.setTreeView(treeView);

    /**
     * 注册添加到收藏夹的命令
     * uri: 单个文件的 URI
     * uris: 多个文件的 URI 数组（多选时）
     * 如果都为空，则使用当前活动编辑器的文件
     */
    let addToFavorites = vscode.commands.registerCommand('vscode-favorites.addToFavorites', async (uri, uris) => {
        if (uris) {
            // 如果提供了个 URI，添加所有文件
            uris.forEach((uri: vscode.Uri) => favoritesProvider.addFavorite(uri));
        } else if (uri) {
            // 如果只提供了一个 URI，添加单个文件
            favoritesProvider.addFavorite(uri);
        } else {
            // 如果没有提供 URI，使用当前活动编辑器
            const activeUri = vscode.window.activeTextEditor?.document.uri;
            if (activeUri) {
                favoritesProvider.addFavorite(activeUri);
            }
        }
    });

    /**
     * 注册从收藏夹移除的命令
     * item: 要移除的项目
     * 如果是从按钮点击，只移除该项
     * 如果是从右键菜单，处理所有选中项
     */
    let removeFromFavorites = vscode.commands.registerCommand('vscode-favorites.removeFromFavorites', async (item) => {
        // 获取所有选中的项目
        const selectedItems = item ? 
            [item, ...treeView.selection.filter(i => i !== item)] : 
            treeView.selection;

        console.log('\n### > Selected items for removal:', JSON.stringify(selectedItems, null, 2));
        
        if (selectedItems && selectedItems.length > 0) {
            // 直接删除所有选中的项目，不再显示确认对话框
            selectedItems.forEach(item => {
                favoritesProvider.removeFavorite(item);
            });
        }
    });

    /**
     * 注册打开收藏文件的命令
     * 支持三种方式：
     * 1. openFavoriteFiles: 打开所有选中的文件
     * 2. openSelectedFiles: 打开选中的文件（别名）
     * 3. openFavoriteFile: 打开单个文件
     */
    let openFavoriteFiles = vscode.commands.registerCommand('vscode-favorites.openFavoriteFiles', async () => {
        const selectedItems = favoritesProvider.getSelectedItems();
        for (const item of selectedItems) {
            if (item.type === 'file') {
                // 使用 VS Code 的内置命令打开文件
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

    let addToGroup = vscode.commands.registerCommand('vscode-favorites.addToGroup', async (uri: vscode.Uri, uris?: vscode.Uri[]) => {
        // 修复数组类型问题
        const urisToAdd: vscode.Uri[] = [];
        if (uris) {
            urisToAdd.push(...uris);
        } else if (uri) {
            urisToAdd.push(uri);
        } else {
            const activeUri = vscode.window.activeTextEditor?.document.uri;
            if (activeUri) {
                urisToAdd.push(activeUri);
            }
        }

        // 如果有文件要添加
        if (urisToAdd.length > 0) {
            // 获取现有分组
            const groups = favoritesProvider.getGroups();
            const items: (GroupQuickPickItem | { kind: vscode.QuickPickItemKind })[] = [];
            
            // 添加现有分组到选项中
            groups.forEach(group => {
                items.push({
                    label: group,
                    group: true
                } as GroupQuickPickItem);
            });

            // 添加分隔符和"New Group"选项
            if (groups.length > 0) {
                items.push({ kind: vscode.QuickPickItemKind.Separator });
            }
            items.push({
                label: "New Group...",
                group: false
            } as GroupQuickPickItem);

            // 显示快速选择菜单
            const selected = await vscode.window.showQuickPick(
                items.filter((item): item is GroupQuickPickItem => !('kind' in item)),
                { placeHolder: 'Select or create a group' }
            );

            if (selected) {
                let targetGroup = selected.label;
                if (!selected.group) {
                    // 如果选择了"New Group"，提示输入新组名
                    const newGroupName = await vscode.window.showInputBox({
                        placeHolder: "Enter group name",
                        prompt: "Enter a name for the new favorite group",
                        validateInput: value => {
                            if (!value) return 'Group name cannot be empty';
                            if (favoritesProvider.hasGroup(value)) {
                                return 'Group name already exists';
                            }
                            return null;
                        }
                    });
                    if (!newGroupName) return;
                    targetGroup = newGroupName;
                }

                // 添加所有文件到目标分组
                for (const uri of urisToAdd) {
                    await favoritesProvider.addToGroup(uri, targetGroup);
                }
            }
        }
    });

    let removeFromGroup = vscode.commands.registerCommand('vscode-favorites.removeFromGroup', (item, groupName) => {
        if (item && groupName) {
            favoritesProvider.removeFromGroup(item, groupName);
        }
    });

    let renameGroup = vscode.commands.registerCommand('vscode-favorites.renameGroup', async (groupElement) => {
        await favoritesProvider.renameGroup(groupElement);
    });

    let deleteGroup = vscode.commands.registerCommand('vscode-favorites.deleteGroup', async (groupElement) => {
        await favoritesProvider.deleteGroup(groupElement);
    });

    // 注册添加新分组的命令
    let addNewGroup = vscode.commands.registerCommand('vscode-favorites.addNewGroup', async () => {
        // 从右上角按钮调用，传入 undefined 而不是 null
        await favoritesProvider.addNewGroup(undefined);
    });

    let moveToGroup = vscode.commands.registerCommand('vscode-favorites.moveToGroup', async (item: FavoriteItem) => {
        await favoritesProvider.moveToGroup(item, undefined);
    });

    let copyToGroup = vscode.commands.registerCommand('vscode-favorites.copyToGroup', async (item: FavoriteItem) => {
        await favoritesProvider.copyToGroup(item, undefined);
    });

    // 注册添加子分组的命令
    let addNewSubGroup = vscode.commands.registerCommand('vscode-favorites.addNewSubGroup', async (parentGroup) => {
        // 直接使用现有的 addNewGroup 方法，因为它已经支持父分组
        await favoritesProvider.addNewGroup(parentGroup);
    });

    // 注册删除所有收藏命令
    let removeAll = vscode.commands.registerCommand('vscode-favorites.removeAll', async () => {
        await favoritesProvider.removeAll();
    });

    // 注册设置激活分组的命令
    let setActiveGroup = vscode.commands.registerCommand('vscode-favorites.setActiveGroup', async (groupElement) => {
        favoritesProvider.setActiveGroup(groupElement.name);
    });

    // 注册取消激活分组的命令
    let deactivateGroup = vscode.commands.registerCommand('vscode-favorites.deactivateGroup', async () => {
        favoritesProvider.setActiveGroup(null);
    });

    // 注册打开数据文件的命令
    let openDataFile = vscode.commands.registerCommand('vscode-favorites.openDataFile', async () => {
        try {
            // 获取当前工作区的第一个根目录
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            // 构建数据文件路径
            const favorPath = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'favor.json');

            // 确保文件存在
            if (!fs.existsSync(favorPath.fsPath)) {
                // 如果文件不存在，创建一个空的数据文件
                const emptyData = {
                    favorites: [],
                    groups: {},
                    activeGroup: null
                };
                fs.writeFileSync(favorPath.fsPath, JSON.stringify(emptyData, null, 2), 'utf8');
            }

            // 打开文件
            await vscode.commands.executeCommand('vscode.open', favorPath);
        } catch (error) {
            if (error instanceof Error) {
                console.error('Error opening data file:', error);
                vscode.window.showErrorMessage(`Failed to open data file: ${error.message}`);
            }
        }
    });

    let undo = vscode.commands.registerCommand('vscode-favorites.undo', async () => {
        await favoritesProvider.undo();
    });

    /**
     * 将所有注册的命令和视图添加到订阅列表
     * 这样在扩展停用时，VS Code 会自动清理这些资源
     */
    context.subscriptions.push(
        treeView,
        addToFavorites,
        removeFromFavorites,
        openFavoriteFiles,
        openSelectedFiles,
        openFavoriteFile,
        addToGroup,
        removeFromGroup,
        renameGroup,
        deleteGroup,
        addNewGroup,
        moveToGroup,
        copyToGroup,
        addNewSubGroup,
        removeAll,
        setActiveGroup,
        deactivateGroup,
        openDataFile,
        undo
    );
}

/**
 * VS Code 扩展的停用函数
 * 当扩展被停用时，VS Code 会调用这个函数
 * 由于我们使用了 subscriptions，不需要在这里做额外的清理
 */
export function deactivate() {} 