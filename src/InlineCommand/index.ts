import { Command, PlainText } from './parser';
import { SendMessagePayload } from 'kozz-types';

export type CompanionObject = {
	mentions: string[];
};

export type StyleVariant =
	| 'bold'
	| 'code'
	| 'monospace'
	| 'stroke'
	| 'italic'
	| 'listItem'
	| 'paragraph';

type CommandArgs = {
	mention: { id: string };
	invisiblemention: { id: string };
	tageveryone: { except: string[] };
	begin_style: {
		variant: StyleVariant;
	};
	end_style: {
		variant: StyleVariant;
	};
};

type InlineCommandHandler<T extends Record<string, any>> = (
	companion: CompanionObject,
	data: Command<any, T>['commandData'],
	payload: SendMessagePayload
) => Promise<{
	companion: CompanionObject;
	/**
	 * This string will substitute the inline command payload
	 */
	stringValue: string;
}>;

export type InlineCommandMap = {
	[key in keyof CommandArgs]: InlineCommandHandler<CommandArgs[key]>;
};

export const initInlineCommandHandler = (commandMap: Partial<InlineCommandMap>) => {
	const isPlainText = (
		resultItem: PlainText | Command<keyof CommandArgs>
	): resultItem is PlainText => {
		return resultItem.type === 'string';
	};

	const processResultItem = async (
		resultItem: PlainText | Command<keyof InlineCommandMap, any>,
		companionObject: CompanionObject = {
			mentions: [],
		},
		payload: SendMessagePayload
	) => {
		if (isPlainText(resultItem)) {
			return {
				companion: companionObject,
				stringValue: resultItem['value'],
			};
		} else {
			if (!(resultItem.commandName in commandMap)) {
				console.warn(
					`Tried to handle inline-command with name ${resultItem.commandName} but there is not a handler for this.`
				);
				return {
					companion: companionObject,
					stringValue: '',
				};
			}
			return await commandMap[resultItem.commandName]!(
				companionObject,
				resultItem.commandData,
				payload
			);
		}
	};

	const processAllResults = async (
		results: (PlainText | Command<keyof InlineCommandMap, any>)[],
		payload: SendMessagePayload
	) => {
		let companion: CompanionObject = {
			mentions: [],
		};
		let stringValue = '';
		for (let i = 0; i < results.length; i++) {
			let currResult = results[i];

			const { companion: newCompanion, stringValue: newString } =
				await processResultItem(currResult, companion, payload);

			companion = newCompanion;
			stringValue += newString;
		}

		return {
			companion,
			stringValue,
		};
	};

	return {
		consume: processAllResults,
	};
};
