import {
	BoundaryIntroduction,
	DeleteMessagePayload,
	ForwardableUserJoinedGroup,
	ForwardableUserLeftGroup,
	MessageReceived,
	Platform,
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

	const forwardEvent = (evName: string, payload: any) => {
		kozzSocket.emit(evName, payload);
	};

	const onNewMessage = (payload: MessageReceived) => {
		kozzSocket.emit('message', payload);
	};

	const onUserJoinedGroup = (payload: ForwardableUserJoinedGroup) => {
		kozzSocket.emit('forward_event', {
			eventName: 'user_joined_group',
			payload,
		});
	};

	const onUserLeftGroup = (payload: ForwardableUserLeftGroup) => {
		kozzSocket.emit('forward_event', {
			eventName: 'user_left_group',
			payload,
		});
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
		kozzSocket.on('reply_with_text', async (payload: SendMediaPayload) => {
			if (!payload.media) {
				throw '[ERROR]: Evoked reply_with_sticker with payload without media';
			}

			const results = parseMessageBody(payload.body);
			const { companion, stringValue } = await consume(results, payload);

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

	return {
		kozzSocket,
		forwardEvent,
		onNewMessage,
		onUserJoinedGroup,
		onUserLeftGroup,
		handleReactMessage,
		handleReplyWithMedia,
		handleReplyWithSticker,
		handleReplyWithText,
		handleSendMessage,
		handleSendMessageWithMedia,
		hanldeDeleteMessage,
	};
};
