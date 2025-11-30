import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "./ui/accordion";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

interface StagResult {
	id: string;
	name: string;
	data?: unknown;
	error?: string;
}

interface StageResultsPanelProps {
	stages: StagResult[];
	selectedStageId?: string;
	onSelectStage?: (stageId: string) => void;
}

export function StageResultsPanel({
	stages,
	selectedStageId,
	onSelectStage,
}: StageResultsPanelProps) {
	const defaultValue = selectedStageId || undefined;

	const handleValueChange = (value: string) => {
		if (onSelectStage) {
			onSelectStage(value);
		}
	};

	if (stages.length === 0) {
		return (
			<div className="h-full flex items-center justify-center text-muted-foreground p-4">
				<p>No stage results yet</p>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto bg-muted/50 border-l">
			<div className="p-4 space-y-2">
				<h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">
					Stage Results
				</h3>

				<Accordion
					type="single"
					collapsible
					value={defaultValue}
					onValueChange={handleValueChange}
					className="space-y-2"
				>
					{stages.map((stage) => (
						<AccordionItem
							key={stage.id}
							value={stage.id}
							className="border rounded-lg overflow-hidden bg-card"
						>
							<AccordionTrigger className="px-4 py-3 hover:no-underline">
								<div className="flex items-center justify-between w-full pr-4">
									<div className="flex items-center gap-2">
										<div className="text-left">
											<div className="font-medium text-sm">{stage.name}</div>
											<div className="text-xs text-muted-foreground">
												{stage.error ? (
													<Badge variant="destructive" className="text-xs">
														Error
													</Badge>
												) : (
													<Badge variant="default" className="text-xs">
														Completed
													</Badge>
												)}
											</div>
										</div>
									</div>
								</div>
							</AccordionTrigger>
							<AccordionContent className="px-4 pb-3">
								{stage.error ? (
									<Card className="p-3 bg-destructive/10 border-destructive/20">
										<div className="text-sm text-destructive font-mono">
											{stage.error}
										</div>
									</Card>
								) : stage.data ? (
									<details className="text-xs">
										<summary className="cursor-pointer font-mono text-muted-foreground hover:text-foreground mb-2">
											JSON Output
										</summary>
										<pre className="bg-muted p-2 rounded border overflow-x-auto text-foreground whitespace-pre-wrap break-words">
											{JSON.stringify(stage.data, null, 2)}
										</pre>
									</details>
								) : (
									<div className="text-xs text-muted-foreground">
										No data available
									</div>
								)}
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			</div>
		</div>
	);
}
