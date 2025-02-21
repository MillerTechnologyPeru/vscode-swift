//===----------------------------------------------------------------------===//
//
// This source file is part of the VSCode Swift open source project
//
// Copyright (c) 2021-2022 the VSCode Swift project authors
// Licensed under Apache License v2.0
//
// See LICENSE.txt for license information
// See CONTRIBUTORS.txt for the list of VSCode Swift project authors
//
// SPDX-License-Identifier: Apache-2.0
//
//===----------------------------------------------------------------------===//

import * as vscode from "vscode";
import * as commands from "./commands";
import * as debug from "./debugger/launch";
import { PackageDependenciesProvider } from "./ui/PackageDependencyProvider";
import * as commentCompletion from "./editor/CommentCompletion";
import { SwiftTaskProvider } from "./SwiftTaskProvider";
import { FolderEvent, WorkspaceContext } from "./WorkspaceContext";
import { TestExplorer } from "./TestExplorer/TestExplorer";
import { LanguageStatusItems } from "./ui/LanguageStatusItems";
import { getErrorDescription } from "./utilities/utilities";
import { SwiftPluginTaskProvider } from "./SwiftPluginTaskProvider";
import configuration from "./configuration";

/**
 * External API as exposed by the extension. Can be queried by other extensions
 * or by the integration test runner for VSCode extensions.
 */
export interface Api {
    workspaceContext: WorkspaceContext;
}

/**
 * Activate the extension. This is the main entry point.
 */
export async function activate(context: vscode.ExtensionContext): Promise<Api> {
    try {
        console.debug("Activating Swift for Visual Studio Code...");

        const workspaceContext = await WorkspaceContext.create();

        context.subscriptions.push(workspaceContext);

        // setup swift version of LLDB. Don't await on this as it can run in the background
        workspaceContext.setLLDBVersion();

        // listen for workspace folder changes and active text editor changes
        workspaceContext.setupEventListeners();

        // Register task provider.
        const taskProvider = vscode.tasks.registerTaskProvider(
            "swift",
            new SwiftTaskProvider(workspaceContext)
        );
        // Register swift plugin task provider.
        const pluginTaskProvider = vscode.tasks.registerTaskProvider(
            "swift-plugin",
            new SwiftPluginTaskProvider(workspaceContext)
        );
        commands.register(workspaceContext);

        const commentCompletionProvider = commentCompletion.register();

        const languageStatusItem = new LanguageStatusItems(workspaceContext);

        // observer for logging workspace folder addition/removal
        const logObserver = workspaceContext.observeFolders((folderContext, event) => {
            workspaceContext.outputChannel.log(
                `${event}: ${folderContext?.folder.fsPath}`,
                folderContext?.name
            );
        });

        // dependency view
        const dependenciesProvider = new PackageDependenciesProvider(workspaceContext);
        const dependenciesView = vscode.window.createTreeView("packageDependencies", {
            treeDataProvider: dependenciesProvider,
            showCollapseAll: true,
        });
        dependenciesProvider.observeFolders(dependenciesView);

        // observer that will resolve package and build launch configurations
        const resolvePackageObserver = workspaceContext.observeFolders(async (folder, event) => {
            if (!folder) {
                return;
            }
            switch (event) {
                case FolderEvent.add:
                case FolderEvent.packageUpdated:
                    // Create launch.json files based on package description.
                    debug.makeDebugConfigurations(folder);
                    if (folder.swiftPackage.foundPackage && !configuration.disableAutoResolve) {
                        await commands.resolveFolderDependencies(folder, true);
                    }
                    break;

                case FolderEvent.resolvedUpdated:
                    if (folder.swiftPackage.foundPackage && !configuration.disableAutoResolve) {
                        await commands.resolveFolderDependencies(folder, true);
                    }
            }
        });

        const testExplorerObserver = TestExplorer.observeFolders(workspaceContext);

        // setup workspace context with initial workspace folders
        workspaceContext.addWorkspaceFolders();

        // Register any disposables for cleanup when the extension deactivates.
        context.subscriptions.push(
            resolvePackageObserver,
            testExplorerObserver,
            dependenciesView,
            dependenciesProvider,
            logObserver,
            languageStatusItem,
            commentCompletionProvider,
            pluginTaskProvider,
            taskProvider
        );

        return { workspaceContext };
    } catch (error) {
        const errorMessage = getErrorDescription(error);
        // show this error message as the VSCode error message only shows when running
        // the extension through the debugger
        vscode.window.showErrorMessage(`Activating Swift extension failed: ${errorMessage}`);
        throw Error(errorMessage);
    }
}

/**
 * Deactivate the extension.
 *
 * Any disposables registered in `context.subscriptions` will be automatically
 * disposed of, so there's nothing left to do here.
 */
export function deactivate() {
    return;
}
