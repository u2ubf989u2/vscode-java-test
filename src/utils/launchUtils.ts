// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { DebugConfiguration, Position } from 'vscode';
import { TestKind, TestLevel } from '../protocols';
import { IExecutionConfig } from '../runConfigs';
import { BaseRunner } from '../runners/baseRunner/BaseRunner';
import { IJUnitLaunchArguments } from '../runners/baseRunner/BaseRunner';
import { IRunnerContext } from '../runners/models';
import { resolveJUnitLaunchArguments } from './commandUtils';
import { randomSequence } from './configUtils';

export async function resolveLaunchConfigurationForRunner(runner: BaseRunner, runnerContext: IRunnerContext, config?: IExecutionConfig): Promise<DebugConfiguration> {
    let resolvedArguments: IJUnitLaunchArguments;
    if (runnerContext.kind === TestKind.TestNG) {
        resolvedArguments = await getTestNGLaunchArguments(runnerContext.projectName);
    } else {
        resolvedArguments = await getJUnitLaunchArguments(runnerContext);
    }

    let launchConfig: DebugConfiguration = {
        name: `Launch Java Tests - ${randomSequence()}`,
        type: 'java',
        request: 'launch',
        projectName: resolvedArguments.projectName,
    };

    // parse the main class
    if (runnerContext.kind === TestKind.TestNG) {
        launchConfig.mainClass = runner.runnerMainClassName;
    } else {
        launchConfig.mainClass = resolvedArguments.mainClass;
    }

    // parse the cwd
    if (config?.workingDirectory) {
        launchConfig.cwd = config.workingDirectory;
    } else if (config?.cwd) {
        launchConfig.cwd = config.cwd;
    } else {
        launchConfig.cwd = resolvedArguments.workingDirectory;
    }

    // parse the classpath
    launchConfig.classPaths = [];
    if (config?.classPaths) {
        launchConfig.classPaths.push(...config.classPaths);
    }
    launchConfig.classPaths.push(...resolvedArguments.classpath);
    if (runnerContext.kind === TestKind.TestNG) {
        launchConfig.classPaths.push(await runner.runnerJarFilePath, await runner.runnerLibPath);
    }

    // parse the modulePaths
    launchConfig.modulePaths = [];
    // module path cannot be duplicated: http://openjdk.java.net/jeps/261
    if (config?.modulePaths) {
        launchConfig.modulePaths = config.modulePaths;
    } else {
        launchConfig.modulePaths = resolvedArguments.modulepath;
    }

    // parse args
    if (runnerContext.kind === TestKind.TestNG) {
        launchConfig.args = runner.getApplicationArgs(config);
    } else {
        launchConfig.args = resolvedArguments.programArguments;
    }

    // parse vmArgs
    launchConfig.vmArgs = resolvedArguments.vmArguments;
    if (config?.vmArgs) {
        launchConfig.vmArgs.push(...config.vmArgs.filter(Boolean));
    } else if (config?.vmargs) {
        launchConfig.vmArgs.push(...config.vmargs.filter(Boolean));
    }

    // parse remaining entries
    if (config) {
        const parsedKeys: string[] = ['name', 'type', 'request', 'projectName', 'mainClass', 'cwd',
                'workingDirectory', 'classPaths', 'modulePaths', 'args', 'vmargs', 'vmArgs'];
        const remainingEntries: {[key: string]: any} = Object.keys(config)
            .filter((key: string) => !parsedKeys.includes(key))
            .reduce((obj: any, key: string) => {
                obj[key] = config[key];
                return obj;
            }, {});
        launchConfig = Object.assign(launchConfig, remainingEntries);
    }

    launchConfig.noDebug = !runnerContext.isDebug;

    return launchConfig;
}

async function getJUnitLaunchArguments(runnerContext: IRunnerContext): Promise<IJUnitLaunchArguments> {
    let className: string = '';
    let methodName: string = '';

    const nameArray: string[] = runnerContext.fullName.split('#');
    className = nameArray[0];
    if (nameArray.length > 1) {
        methodName = nameArray[1];
    }

    let start: Position | undefined;
    let end: Position | undefined;
    if (runnerContext.kind === TestKind.JUnit5 && runnerContext.scope === TestLevel.Method) {
        start = runnerContext.tests[0].location.range.start;
        end = runnerContext.tests[0].location.range.end;
    }

    return await resolveJUnitLaunchArguments(runnerContext.testUri, className, methodName, runnerContext.projectName, runnerContext.scope, runnerContext.kind, start, end, runnerContext.isHierarchicalPackage);
}

async function getTestNGLaunchArguments(projectName: string): Promise<IJUnitLaunchArguments> {
    return await resolveJUnitLaunchArguments('', '', '', projectName, TestLevel.Root, TestKind.TestNG);
}
