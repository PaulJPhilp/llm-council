import { useEffect, useState } from "react";
import { api } from "../api";
import type { WorkflowMetadata } from "../types";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";

interface WorkflowSelectorProps {
	onSelectWorkflow: (workflowId: string) => void;
	isLoading?: boolean;
}

export function WorkflowSelector({
	onSelectWorkflow,
	isLoading = false,
}: WorkflowSelectorProps) {
	const [workflows, setWorkflows] = useState<WorkflowMetadata[]>([]);
	const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		loadWorkflows();
	}, []);

	async function loadWorkflows() {
		try {
			setLoading(true);
			setError(null);
			const workflowList = await api.listWorkflows();
			setWorkflows(workflowList);
			if (workflowList.length > 0) {
				// Check for persisted selection first
				const persisted = localStorage.getItem("selected_workflow_id");
				const initialId = persisted && workflowList.find(w => w.id === persisted)
					? persisted
					: workflowList[0].id;
				setSelectedWorkflowId(initialId);
				onSelectWorkflow(initialId);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load workflows");
		} finally {
			setLoading(false);
		}
	}

	function handleSelectWorkflow(workflowId: string) {
		setSelectedWorkflowId(workflowId);
		onSelectWorkflow(workflowId);
	}

	if (loading) {
		return (
			<div className="flex items-center gap-2 px-4 py-2">
				<div className="text-sm text-muted-foreground">Loading workflows...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center gap-2 px-4 py-2">
				<div className="text-sm text-destructive">{error}</div>
				<Button
					onClick={loadWorkflows}
					variant="outline"
					size="sm"
					className="text-xs"
				>
					Retry
				</Button>
			</div>
		);
	}

	if (workflows.length === 0) {
		return (
			<div className="flex items-center gap-2 px-4 py-2">
				<div className="text-sm text-muted-foreground">No workflows available</div>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2 px-4 py-2">
			<Label htmlFor="workflow-select" className="text-sm font-medium">
				Workflow:
			</Label>
			<Select
				value={selectedWorkflowId}
				onValueChange={handleSelectWorkflow}
				disabled={isLoading}
			>
				<SelectTrigger id="workflow-select" className="flex-1">
					<SelectValue placeholder="Select a workflow" />
				</SelectTrigger>
				<SelectContent>
					{workflows.map((workflow) => (
						<SelectItem key={workflow.id} value={workflow.id}>
							{workflow.name} (v{workflow.version}) - {workflow.stageCount}{" "}
							stages
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
