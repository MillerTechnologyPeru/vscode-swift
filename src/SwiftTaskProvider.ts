import * as vscode from 'vscode';
import { exec } from './utilities';

/**
 * References:
 * 
 * - General information on tasks:
 *   https://code.visualstudio.com/docs/editor/tasks
 * - Contributing task definitions:
 *   https://code.visualstudio.com/api/references/contribution-points#contributes.taskDefinitions
 * - Implementing task providers:
 *   https://code.visualstudio.com/api/extension-guides/task-provider
 */

/**
 * Describes a target in this package.
 */
interface Target {

    name: string;
    type: 'executable' | 'library' | 'test';
}

/**
 * Creates a {@link vscode.Task Task} to build all targets in this package.
 * This excludes test targets.
 */
function createBuildAllTask(): vscode.Task {
    return createSwiftTask('swift', ['build'], 'Build All Targets', vscode.TaskGroup.Build);
}

/**
 * Creates a {@link vscode.Task Task} to clean the build artifacts.
 */
function createCleanTask(): vscode.Task {
    return createSwiftTask('swift', ['package', 'clean'], 'Clean Build Artifacts', vscode.TaskGroup.Clean);
}

/**
 * Creates a {@link vscode.Task Task} to run an executable target.
 */
 function createExecutableTask(target: Target): vscode.Task {
    return createSwiftTask('swift', ['run', target.name], `Run ${target.name}`, vscode.TaskGroup.Build);
}

/**
 * Creates a {@link vscode.Task Task} to resolve the package dependencies.
 */
function createResolveTask(): vscode.Task {
    return createSwiftTask('swift', ['package', 'resolve'], 'Resolve Package Dependencies');
}

/**
 * Creates a {@link vscode.Task Task} to update the package dependencies.
 */
function createUpdateTask(): vscode.Task {
    return createSwiftTask('swift', ['package', 'update'], 'Update Package Dependencies');
}

/**
 * Helper function to create a {@link vscode.Task Task} with the given parameters.
 */
function createSwiftTask(command: string, args: string[], name: string, group?: vscode.TaskGroup): vscode.Task {
    let task = new vscode.Task(
        { type: 'swift', command: command, args: args },
        vscode.TaskScope.Workspace,
        name,
        'swift',
        new vscode.ShellExecution(command, args)
    );
    // TODO: The detail string should include any quotes added by VS Code.
    // How can we find out which quotes were added?
    task.detail = `${command} ${args.join(' ')}`;
    task.group = group;
    return task;
}

/**
 * A {@link vscode.TaskProvider TaskProvider} for tasks that match the definition
 * in **package.json**: `{ type: 'swift'; command: string; args: string[] }`.
 * 
 * See {@link SwiftTaskProvider.provideTasks provideTasks} for a list of provided tasks.
 */
export class SwiftTaskProvider implements vscode.TaskProvider {

    constructor(private workspaceRoot: string) { }

    /**
     * Provides tasks to run the following commands:
     * 
     * - `swift build`
     * - `swift package clean`
     * - `swift package resolve`
     * - `swift package update`
     * - `swift run ${target}` for every executable target
     */
    async provideTasks(token: vscode.CancellationToken): Promise<vscode.Task[]> {
        let tasks = [
            createBuildAllTask(),
            createCleanTask(),
            createResolveTask(),
            createUpdateTask()
        ];
        const targets = await this.findTargets();
        for (const target of targets) {
            if (target.type === 'executable') {
                tasks.push(createExecutableTask(target));
            }
        }
        return tasks;
    }

    /**
     * Resolves a {@link vscode.Task Task} specified in **tasks.json**.
     * 
     * Other than its definition, this `Task` may be incomplete,
     * so this method should fill in the blanks.
     */
    resolveTask(task: vscode.Task, token: vscode.CancellationToken): vscode.Task {
        // We need to create a new Task object here.
        // Reusing the task parameter doesn't seem to work.
        let newTask = new vscode.Task(
            task.definition,
            vscode.TaskScope.Workspace,
            task.name || 'Custom Task',
            'swift',
            new vscode.ShellExecution(task.definition.command, task.definition.args)
        );
        newTask.detail = task.detail ?? `${task.definition.command} ${task.definition.args.join(' ')}`;
        newTask.group = task.group;
        return newTask;
    }

    /**
     * Uses `swift package describe` to find all targets in this package.
     */
    private async findTargets(): Promise<Target[]> {
        const { stdout } = await exec('swift package describe --type json', { cwd: this.workspaceRoot });
        return JSON.parse(stdout).targets.map((target: any) => {
            return { name: target.name, type: target.type };
        });
    }
}
