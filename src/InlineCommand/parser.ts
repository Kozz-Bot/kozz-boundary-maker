export type PlainText = {
	type: 'string';
	value: string;
};

export type Command<N extends string, T extends Record<string, any> = {}> = {
	type: 'command';
	commandName: N;
	commandData: T;
};

const readJsonPayload = (input: string, start: number) => {
	if (input[start] !== '{') {
		return null;
	}

	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = start; i < input.length; i++) {
		const char = input[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === '\\') {
			escaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (char === '{') {
			depth++;
		}
		if (char === '}') {
			depth--;
			if (depth === 0) {
				return input.slice(start, i + 1);
			}
		}
	}

	return null;
};

const parseInlineCommandAt = (input: string, start: number) => {
	const match = /^%([^:%]+):/.exec(input.slice(start));
	if (!match) {
		return null;
	}

	const payloadStart = start + match[0].length;
	const payload = readJsonPayload(input, payloadStart);
	if (!payload) {
		return null;
	}

	try {
		return {
			item: {
				type: 'command',
				commandName: match[1],
				commandData: JSON.parse(payload),
			} as const,
			nextIndex: payloadStart + payload.length,
		};
	} catch {
		return null;
	}
};

export const parseMessageBody = (string: string): (PlainText | Command<any>)[] => {
	const result: (PlainText | Command<any>)[] = [];
	let stringBuffer = '';

	for (let i = 0; i < string.length;) {
		const command = string[i] === '%' ? parseInlineCommandAt(string, i) : null;

		if (command) {
			if (stringBuffer) {
				result.push({
					type: 'string',
					value: stringBuffer,
				});
				stringBuffer = '';
			}

			result.push(command.item);
			i = command.nextIndex;
			continue;
		}

		stringBuffer += string[i];
		i++;
	}

	if (stringBuffer) {
		result.push({
			type: 'string',
			value: stringBuffer,
		});
	}

	if (!result.length) {
		return [
			{
				type: 'string',
				value: string,
			},
		];
	}

	return result;
};
