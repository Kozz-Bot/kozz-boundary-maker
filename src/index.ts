import {
	AskResourcePayload,
	BoundaryIntroduction,
	DeleteMessagePayload,
	ForwardableUserJoinedGroup,
	ForwardableUserLeftGroup,
	MessageReceived,
	Platform,
	ProvideResourcePayload,
	ReactToMessagePayload,
	SendMediaPayload,
	SendMessagePayload,
	SignaturelessPayload,
} from 'kozz-types';
import { io } from 'socket.io-client';
import { signPayload } from './util/PayloadSign';
import {
	CompanionObject,
	initInlineCommandHandler,
	InlineCommandMap,
} from './InlineCommand';
import { parseMessageBody } from './InlineCommand/parser';

type InitOptions = {
	url: string;
	socketPath?: string;
	chatPlatform: Platform;
	name: string;
	inlineCommandMap?: InlineCommandMap;
};

type EventPayload = {
	message: MessageReceived;
	user_left_group: ForwardableUserLeftGroup;
	user_joined_group: ForwardableUserJoinedGroup;
	connect: SignaturelessPayload<BoundaryIntroduction>;
	reply_with_text: SendMessagePayload;
	reply_with_media: SendMessagePayload;
	reply_with_sticker: SendMessagePayload;
	send_message: SendMessagePayload;
	send_message_with_media: SendMessagePayload;
	send_message_with_sticker: SendMessagePayload;
	react_message: ReactToMessagePayload;
	delete_message: DeleteMessagePayload;
};

type EventName = keyof EventPayload;

type EvCallback = {
	[evName in keyof EventPayload]: (payload: EventPayload[evName]) => any;
};

type Event = {
	name: string;
	callback: (payload: any) => any;
};

type EventQueue = Event[];

const initBoundary = ({
	url,
	socketPath,
	chatPlatform,
	name,
	inlineCommandMap,
}: InitOptions) => {
	const kozzSocket = io(url, {
		path: socketPath ?? '/socket.io/',
	});

	const { consume } = initInlineCommandHandler(inlineCommandMap ?? {});

	kozzSocket.on('connect', () => {
		const payload: SignaturelessPayload<BoundaryIntroduction> = {
			OS: process.platform,
			platform: chatPlatform,
			role: 'boundary',
			name,
		};

		kozzSocket.emit('introduction', signPayload(payload));
	});

	const emitForwardableEvent = (evName: string, payload: any) => {
		kozzSocket.emit(evName, payload);
	};

	const emitMessage = (payload: MessageReceived) => {
		kozzSocket.emit('message', payload);
		triggerEventsFromQueue('message', payload);
	};

	const emitUserJoinedGroup = (payload: ForwardableUserJoinedGroup) => {
		kozzSocket.emit('forward_event', {
			eventName: 'user_joined_group',
			payload,
		});
		triggerEventsFromQueue('user_joined_group', payload);
	};

	const emitUserLeftGroup = (payload: ForwardableUserLeftGroup) => {
		kozzSocket.emit('forward_event', {
			eventName: 'user_left_group',
			payload,
		});
		triggerEventsFromQueue('user_left_group', payload);
	};

	const handleReplyWithText = (
		replyFn: (
			payload: SendMediaPayload,
			companion: CompanionObject,
			stringValue: string
		) => any
	) => {
		kozzSocket.on('reply_with_text', async (payload: SendMessagePayload) => {
			const results = parseMessageBody(payload.body);
			const { companion, stringValue } = await consume(results, payload);

			triggerEventsFromQueue('reply_with_text', payload);

			return replyFn(payload, companion, stringValue);
		});
	};

	const handleReplyWithSticker = (
		replyFn: (
			payload: SendMediaPayload,
			companion: CompanionObject,
			stringValue: string
		) => any
	) => {
		kozzSocket.on('reply_with_sticker', async (payload: SendMediaPayload) => {
			if (!payload.media) {
				throw '[ERROR]: Evoked reply_with_sticker with payload without media';
			}

			const results = parseMessageBody(payload.body);
			const { companion, stringValue } = await consume(results, payload);

			triggerEventsFromQueue('reply_with_sticker', payload);

			return replyFn(payload, companion, stringValue);
		});
	};

	const handleReplyWithMedia = (
		replyFn: (
			payload: SendMediaPayload,
			companion: CompanionObject,
			stringValue: string
		) => any
	) => {
		kozzSocket.on('reply_with_media', async (payload: SendMediaPayload) => {
			if (!payload.media) {
				throw '[ERROR]: Evoked reply_with_sticker with payload without media';
			}

			const results = parseMessageBody(payload.body);
			const { companion, stringValue } = await consume(results, payload);

			triggerEventsFromQueue('reply_with_text', payload);

			return replyFn(payload, companion, stringValue);
		});
	};

	const handleSendMessage = (
		replyFn: (
			payload: SendMediaPayload,
			companion: CompanionObject,
			stringValue: string
		) => any
	) => {
		kozzSocket.on('send_message', async (payload: SendMediaPayload) => {
			const results = parseMessageBody(payload.body);
			const { companion, stringValue } = await consume(results, payload);

			return replyFn(payload, companion, stringValue);
		});
	};

	const handleSendMessageWithMedia = (
		sendMessageFn: (payload: SendMediaPayload) => any
	) => {
		kozzSocket.on('send_message_with_media', payload => {
			if (!payload.media) {
				throw '[ERROR]: Evoked reply_with_sticker with payload without media';
			}

			sendMessageFn(payload);
		});
	};

	const handleSendMessageWithSticker = (
		replyFn: (
			payload: SendMediaPayload,
			companion: CompanionObject,
			stringValue: string
		) => any
	) => {
		kozzSocket.on('send_message_with_sticker', async (payload: SendMediaPayload) => {
			if (!payload.media) {
				throw '[ERROR]: Evoked send_message_with_sticker with payload without media';
			}

			const results = parseMessageBody(payload.body);
			const { companion, stringValue } = await consume(results, payload);

			triggerEventsFromQueue('send_message_with_sticker', payload);

			return replyFn(payload, companion, stringValue);
		});
	};

	const handleReactMessage = (
		reactMessageFn: (payload: ReactToMessagePayload) => any
	) => {
		kozzSocket.on('react_message', payload => {
			return reactMessageFn(payload);
		});
	};

	const hanldeDeleteMessage = (
		deleteMessageFn: (payload: DeleteMessagePayload) => any
	) => {
		kozzSocket.on('delete_message', payload => {
			return deleteMessageFn(payload);
		});
	};

	const evQueue: EventQueue = [];

	const on = <EvName extends EventName>(
		evName: EvName,
		handler: EvCallback[EvName]
	) => {
		evQueue.push({
			name: evName,
			callback: handler,
		});
	};

	const triggerEventsFromQueue = <EvName extends EventName>(
		evName: EvName,
		payload: EventPayload[EvName]
	) => {
		evQueue.forEach(event => {
			if (evName === event.name) {
				event.callback(payload);
			}
		});
	};

	type ResourceGetterFn = (data: any) => any;
	const resourceMap: Record<string, ResourceGetterFn> = {};

	const onAskResource = (resourceName: string, getterFn: ResourceGetterFn) => {
		resourceMap[resourceName] = getterFn;
	};

	const gatherResource = (resourceName: string, data: any) => {
		if (!resourceMap[resourceName]) {
			return undefined;
		}

		return resourceMap[resourceName](data);
	};

	kozzSocket.on('ask_resource', async (payload: AskResourcePayload) => {
		const { data, resource } = payload.request;
		const response = await gatherResource(resource, data);

		const responsePayload: ProvideResourcePayload = {
			...payload,
			response,
			timestamp: new Date().getTime(),
		};

		kozzSocket.emit('reply_resource', responsePayload);
	});

	return {
		kozzSocket,
		on,
		onAskResource,
		emitForwardableEvent,
		emitMessage,
		emitUserJoinedGroup,
		emitUserLeftGroup,
		handleReactMessage,
		handleReplyWithMedia,
		handleReplyWithSticker,
		handleReplyWithText,
		handleSendMessage,
		handleSendMessageWithMedia,
		hanldeDeleteMessage,
		handleSendMessageWithSticker,
	};
};

export default initBoundary;
