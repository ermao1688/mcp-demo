import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

interface Project {
	id: string;
	name: string;
	description: string;
	createdAt: string;
	updatedAt: string;
}

interface Todo {
	id: string;
	projectId: string;
	title: string;
	description: string;
	status: "pending" | "in_progress" | "completed";
	priority: "low" | "medium" | "high";
	createdAt: string;
	updatedAt: string;
}

// Define our MCP agent with tools (Still use class in JS/TS)
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Project Planner MCP",
		version: "1.0.0",
	});

	private get KV(): KVNamespace {
		return (this.env as Env).PROJECT_PLANNER_STORE;
	}

	private async getProjectList(): Promise<string[]> {
		const listData = await this.KV.get("project:list");
		// const listData = await (this.env as Env).PROJECT_PLANNER_STORE.get("project:list");
		return listData ? JSON.parse(listData) : [];
		// Only get the whole string value of the json object, still need to extract each one individually.
	}

	private async getTodoList(projectId: string): Promise<string[]> {
		const listData = await this.KV.get(`project:${projectId}:todos`);
		// const listData = await (this.env as Env).PROJECT_PLANNER_STORE.get(`project:${projectId}:todo:list`);
		return listData ? JSON.parse(listData) : [];
	}

	// private async addTodo(projectId: string, todo: Todo): Promise<void> {
	// 	const todoList = await this.getTodoList(projectId);
	// 	todoList.push(todo.id);
	// 	await this.KV.put(`project:${projectId}:todos`, JSON.stringify(todoList));
	// }

	private async updateTodo(projectId: string, todoId: string, todo: Todo): Promise<void> {
		const todoList = await this.getTodoList(projectId);
		const index = todoList.indexOf(todoId);
		if (index !== -1) {
			todoList[index] = todo.id;
		}
	}

	private async deleteTodo(projectId: string, todoId: string): Promise<void> {
		const todoList = await this.getTodoList(projectId);
		const index = todoList.indexOf(todoId);
		if (index !== -1) {
			todoList.splice(index, 1);
		}
		await this.KV.put(`project:${projectId}:todos`, JSON.stringify(todoList));
	}

	async init() {
		// New version MUST use server.registerTool(...)
		this.server.tool(
			"createProject",
			"Create a new project",
			{
				name: z.string(),
				description: z.string().optional().describe("Project description"),
			},
			async ({ name, description }) => {
				const projectId = crypto.randomUUID();

				const project: Project = {
					id: projectId,
					name,
					description: description ?? "",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				};

				await this.KV.put(`project:${project.id}`, JSON.stringify(project));

				// await (this.env as Env).PROJECT_PLANNER_STORE.put(
				// 	`project:${project.id}`, 
				// 	JSON.stringify(project)
				// );

				const projectList = await this.getProjectList();
				projectList.push(projectId);
				await this.KV.put("project:list", JSON.stringify(projectList));

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(project, null, 2),
						},
					],
				};
			},
		);

		this.server.tool(
			"get_project_list",
			"Get the list of all projects",
			{},
			async () => {
				const projectList = await this.getProjectList();
				const projects: Project[] = [];
				for (const projectId of projectList) {
					const projectData = await this.KV.get(`project:${projectId}`);
					if (projectData) {
						projects.push(JSON.parse(projectData));
					}
				}
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(projects, null, 2),
						},
					],
				};
			},
		);

		this.server.tool(
			"create_todo",
			"Create a new todo item for a project",
			{
				projectId: z.string().describe("The ID of the project to create the todo for"),
				title: z.string().describe("The title of the todo").min(1),
				description: z.string().optional().describe("Todo description"),
				priority: z.enum(["low", "medium", "high"]).optional().describe("Todo priority"),
			},
			async ({ projectId, title, description, priority }) => {
				const projectData = await this.KV.get(`project:${projectId}`);
				if (!projectData) {
					return {
						content: [
							{
								type: "text",
								text: `Project with ID ${projectId} not found`,
							},
						],
					};
				}
				const todoId = crypto.randomUUID();
				const todo: Todo = {
					id: todoId,
					projectId: projectId,
					title,
					description: description ?? "",
					priority: priority ?? "medium",
					status: "pending",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				};

				// await this.addTodo(projectId, todo);
				await this.KV.put(`todo:${todoId}`, JSON.stringify(todo));
				const todoList = await this.getTodoList(projectId);
				todoList.push(todoId);
				await this.KV.put(`project:${projectId}:todos`, JSON.stringify(todoList));	

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(todo, null, 2),
						},
					],
				};
			},
		);
	}
};
