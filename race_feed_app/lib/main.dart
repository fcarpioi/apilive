import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:video_player/video_player.dart';

// TODO: ajusta estas constantes con tus valores reales.
const apiBaseUrl = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app';
const raceId = '69200553-464c-4bfd-9b35-4ca6ac1f17f5';
const appId = 'Ryx7YFWobBfGTJqkciCV';
const eventId = 'Medio Maratón';
const feedLimit = 10; // número de historias solicitadas por llamada

void main() {
  runApp(const RaceFeedApp());
}

class RaceFeedApp extends StatelessWidget {
  const RaceFeedApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Race Feed',
      theme: ThemeData(
        brightness: Brightness.dark,
        fontFamily: 'SF Pro Display',
        scaffoldBackgroundColor: AppColors.background,
        colorScheme: const ColorScheme.dark(
          primary: AppColors.primary,
          surface: AppColors.card,
          secondary: AppColors.accentOrange,
        ),
      ),
      home: const FeedScreen(),
    );
  }
}

class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key});

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  late Future<List<RaceFeedItem>> _future;
  final RaceFeedService _service = RaceFeedService(baseUrl: apiBaseUrl);
  final Map<int, VideoPlayerController> _videoControllers = {};
  final Map<int, Future<void>> _videoFutures = {};
  int _currentIndex = 0;
  int? _lastPlayedIndex;

  @override
  void initState() {
    super.initState();
    _future = _loadFeed();
  }

  Future<List<RaceFeedItem>> _loadFeed() async {
    final stories = await _service.fetchStories(
      raceId: raceId,
      appId: appId,
      eventId: eventId,
      limit: feedLimit,
      offset: 0,
    );
    if (stories.isEmpty) return [];
    final list = stories
        .asMap()
        .entries
        .map((entry) => RaceFeedItem.fromStory(entry.value, entry.key))
        .toList();
    _preloadWindow(0, list);
    return list;
  }

  void _preloadWindow(int centerIndex, List<RaceFeedItem> list) {
    final targets = [centerIndex, centerIndex + 1, centerIndex + 2];
    for (final idx in targets) {
      if (idx >= 0 && idx < list.length) {
        _preloadVideo(idx, list[idx]);
      }
    }
    final toRemove = _videoControllers.keys
        .where((k) => k < centerIndex - 2 || k > centerIndex + 3)
        .toList();
    for (final k in toRemove) {
      _videoControllers[k]?.dispose();
      _videoControllers.remove(k);
      _videoFutures.remove(k);
    }
  }

  void _preloadVideo(int index, RaceFeedItem item) {
    if (_videoControllers.containsKey(index)) return;
    final url = item.clipUrl.isNotEmpty
        ? item.clipUrl
        : (item.fileUrl.isNotEmpty ? item.fileUrl : '');
    if (url.isEmpty) return;
    final controller = VideoPlayerController.networkUrl(Uri.parse(url));
    final future = controller.initialize().then((_) {
      controller
        ..setLooping(true)
        ..setVolume(0);
    }).catchError((_) {});
    _videoControllers[index] = controller;
    _videoFutures[index] = future;
  }

  void _setActiveIndex(int index, List<RaceFeedItem> items) {
    _lastPlayedIndex = index;
    _preloadWindow(index, items);
    _pauseAllExcept(index);
    final controller = _videoControllers[index];
    final future = _videoFutures[index];
    if (controller != null && future != null) {
      future.then((_) {
        if (!mounted || _lastPlayedIndex != index) return;
        controller
          ..setLooping(true)
          ..setVolume(0)
          ..play();
      }).catchError((_) {});
    }
  }

  void _pauseAllExcept(int index) {
    for (final entry in _videoControllers.entries) {
      if (entry.key != index) {
        final c = entry.value;
        if (c.value.isPlaying) {
          c.pause();
        }
      }
    }
  }

  @override
  void dispose() {
    for (final controller in _videoControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      floatingActionButton: FloatingActionButton(
        backgroundColor: AppColors.primary,
        onPressed: () {},
        elevation: 4,
        child: const Icon(Icons.add, size: 28),
      ),
      bottomNavigationBar: const SafeArea(
        top: false,
        child: _BottomNavBar(),
      ),
      body: SafeArea(
        child: FutureBuilder<List<RaceFeedItem>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              );
            }
            if (snapshot.hasError) {
              return _ErrorState(
                message: 'No pudimos cargar el feed',
                onRetry: () {
                  setState(() {
                    _future = _loadFeed();
                  });
                },
              );
            }
            final items = snapshot.data ?? [];
            if (items.isEmpty) {
              return _ErrorState(
                message: 'No hay historias disponibles',
                onRetry: () {
                  setState(() {
                    _future = _loadFeed();
                  });
                },
              );
            }
            final RaceFeedItem currentItem = items[_currentIndex];
            if (_lastPlayedIndex != _currentIndex) {
              _setActiveIndex(_currentIndex, items);
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Header(item: currentItem),
                Expanded(
                  child: PageView.builder(
                    scrollDirection: Axis.vertical,
                    itemCount: items.length,
                    onPageChanged: (int index) {
                      setState(() {
                        _currentIndex = index;
                        _setActiveIndex(index, items);
                      });
                    },
                    itemBuilder: (context, index) {
                      return RacePostCard(
                        item: items[index],
                        controller: _videoControllers[index],
                        initFuture: _videoFutures[index],
                        isActive: index == _currentIndex,
                      );
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            message,
            style: const TextStyle(color: Colors.white70, fontSize: 16),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: onRetry,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.item});

  final RaceFeedItem item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.keyboard_arrow_down, color: Colors.white),
                    const SizedBox(width: 6),
                    Text(
                      item.eventName,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text(
                      item.stage,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.7),
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(width: 12),
                    _StatusDot(label: item.status),
                  ],
                ),
              ],
            ),
          ),
          _RoundIconButton(
            icon: Icons.notifications_none_rounded,
            background: Colors.white.withValues(alpha: 0.08),
          ),
        ],
      ),
    );
  }
}

class RacePostCard extends StatelessWidget {
  const RacePostCard({
    super.key,
    required this.item,
    this.controller,
    this.initFuture,
    required this.isActive,
  });

  final RaceFeedItem item;
  final VideoPlayerController? controller;
  final Future<void>? initFuture;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.78,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(26),
          child: Stack(
            children: [
              Positioned.fill(
                child: StoryMedia(
                  item: item,
                  externalController: controller,
                  externalInit: initFuture,
                  isActive: isActive,
                ),
              ),
              Positioned.fill(
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Color.fromARGB(140, 0, 0, 0),
                        Color.fromARGB(200, 0, 0, 0),
                        Color.fromARGB(220, 0, 0, 0),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                right: 16,
                top: 16,
                child: _RoundIconButton(
                  icon: Icons.search,
                  background: AppColors.primary,
                ),
              ),
              Positioned(
                right: 16,
                bottom: 180,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _SocialIcon(icon: Icons.favorite_border, count: item.likes),
                    const SizedBox(height: 12),
                    _SocialIcon(icon: Icons.chat_bubble_outline, count: item.comments),
                    const SizedBox(height: 12),
                    _SocialIcon(icon: Icons.share_outlined, count: item.reposts),
                  ],
                ),
              ),
              Positioned(
                left: 20,
                bottom: 170,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.athleteName.toUpperCase(),
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: AppColors.accentOrange,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        _InfoMetric(label: 'NET SPLIT TIME', value: item.netSplitTime),
                        const SizedBox(width: 18),
                        _InfoMetric(label: 'NEXT TIMING POINT', value: item.nextTimingPoint),
                      ],
                    ),
                  ],
                ),
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 16,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _ParticipantCard(item: item),
                    const SizedBox(height: 10),
                    _StatusBar(text: '${item.statusLabel}: ${item.raceTime}'),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class StoryMedia extends StatefulWidget {
  const StoryMedia({
    super.key,
    required this.item,
    this.externalController,
    this.externalInit,
    this.isActive = false,
  });

  final RaceFeedItem item;
  final VideoPlayerController? externalController;
  final Future<void>? externalInit;
  final bool isActive;

  @override
  State<StoryMedia> createState() => _StoryMediaState();
}

class _StoryMediaState extends State<StoryMedia> {
  VideoPlayerController? _controller;
  Future<void>? _initVideo;
  bool _ownsController = false;

  @override
  void initState() {
    super.initState();
    if (widget.externalController != null) {
      _controller = widget.externalController;
      _initVideo = widget.externalInit;
      _ownsController = false;
    } else {
      final videoSource = widget.item.clipUrl.isNotEmpty
          ? widget.item.clipUrl
          : (widget.item.fileUrl.isNotEmpty ? widget.item.fileUrl : '');
      if (videoSource.isNotEmpty) {
        _controller = VideoPlayerController.networkUrl(Uri.parse(videoSource));
        _initVideo = _controller!.initialize().then((_) {
          _controller!
            ..setLooping(true)
            ..setVolume(0)
            ..play();
          if (mounted) setState(() {});
        }).catchError((_) {
          _controller = null;
        });
        _ownsController = true;
      }
    }
    _syncPlayback();
  }

  @override
  void didUpdateWidget(covariant StoryMedia oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.externalController != oldWidget.externalController ||
        widget.externalInit != oldWidget.externalInit) {
      // Cuando cambia el controlador externo, reasignamos y sincronizamos.
      _controller = widget.externalController;
      _initVideo = widget.externalInit;
      _ownsController = false;
    }
    _syncPlayback();
  }

  @override
  void dispose() {
    if (_ownsController) {
      _controller?.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_controller == null || _initVideo == null) {
      return _buildPlaceholder();
    }

    return FutureBuilder<void>(
      future: _initVideo,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.done && (_controller?.value.isInitialized ?? false)) {
          return FittedBox(
            fit: BoxFit.cover,
            clipBehavior: Clip.hardEdge,
            child: SizedBox(
              width: _controller?.value.size.width ?? 0,
              height: _controller?.value.size.height ?? 0,
              child: _controller != null ? VideoPlayer(_controller!) : const SizedBox.shrink(),
            ),
          );
        }
        return _buildPlaceholder();
      },
    );
  }

  void _syncPlayback() {
    final controller = _controller;
    if (controller == null) return;
    final init = _initVideo;
    if (init == null) return;
    if (widget.isActive) {
      init.then((_) {
        if (!mounted || !widget.isActive) return;
        controller
          ..setLooping(true)
          ..setVolume(0)
          ..play();
      }).catchError((_) {});
    } else {
      if (controller.value.isPlaying) {
        controller.pause();
      }
    }
  }

  Widget _buildPlaceholder() {
    return Image.network(
      widget.item.imageUrl,
      fit: BoxFit.cover,
      loadingBuilder: (context, child, progress) {
        if (progress == null) return child;
        return Container(
          color: Colors.black.withValues(alpha: 0.4),
          child: const Center(
            child: CircularProgressIndicator(
              color: Colors.white,
              strokeWidth: 2.2,
            ),
          ),
        );
      },
      errorBuilder: (_, __, ___) => Container(
        color: Colors.black,
        alignment: Alignment.center,
        child: const Icon(Icons.photo, color: Colors.white54, size: 42),
      ),
    );
  }
}

class _ParticipantCard extends StatelessWidget {
  const _ParticipantCard({required this.item});

  final RaceFeedItem item;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 10,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 26,
            backgroundColor: AppColors.primary.withValues(alpha: 0.12),
            child: Text(
              item.initials,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.athleteName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    _Badge(text: item.bib),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        item.team,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.75),
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _Medal(count: item.podiums),
              const SizedBox(height: 6),
              Text(
                '#${item.rank} General',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.75),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatusBar extends StatelessWidget {
  const _StatusBar({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: const LinearGradient(
          colors: [
            AppColors.primary,
            AppColors.accentOrange,
          ],
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            text,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _BottomNavBar extends StatelessWidget {
  const _BottomNavBar();

  @override
  Widget build(BuildContext context) {
    return BottomAppBar(
      color: AppColors.navBar,
      shape: const CircularNotchedRectangle(),
      child: SizedBox(
        height: 64,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: const [
            _NavItem(icon: Icons.home_filled, label: 'Home', selected: true),
            _NavItem(icon: Icons.info_outline, label: 'Info'),
            SizedBox(width: 48),
            _NavItem(icon: Icons.emoji_events_outlined, label: 'Leaders'),
            _NavItem(icon: Icons.person_outline, label: 'Profile'),
          ],
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    this.selected = false,
  });

  final IconData icon;
  final String label;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 32,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            icon,
            color: selected ? AppColors.primary : Colors.white70,
            size: 19,
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              color: selected ? AppColors.primary : Colors.white70,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({
    required this.icon,
    required this.background,
  });

  final IconData icon;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: background,
        shape: BoxShape.circle,
      ),
      child: Icon(icon, color: Colors.white),
    );
  }
}

class _SocialIcon extends StatelessWidget {
  const _SocialIcon({required this.icon, required this.count});

  final IconData icon;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: Colors.white, size: 22),
        ),
        const SizedBox(height: 2),
        Text(
          _formatCount(count),
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w600,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}

class _InfoMetric extends StatelessWidget {
  const _InfoMetric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.6),
            fontSize: 12,
            letterSpacing: 0.5,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

class _Medal extends StatelessWidget {
  const _Medal({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: const BoxDecoration(
            color: Color(0xFF1F1C25),
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.emoji_events_outlined,
            color: Colors.amber,
            size: 18,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          '$count',
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: const BoxDecoration(
            color: Colors.redAccent,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class RaceFeedService {
  RaceFeedService({required this.baseUrl, http.Client? client}) : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  Future<List<RaceStory>> fetchStories({
    required String raceId,
    required String appId,
    required String eventId,
    int limit = 10,
    int offset = 0,
  }) async {
    final uri = Uri.parse('$baseUrl/api/race-events').replace(queryParameters: {
      'raceId': raceId,
      'appId': appId,
      'eventId': eventId,
      'limit': '$limit',
      'offset': '$offset',
    });

    final response = await _client.get(uri);
    if (response.statusCode >= 400) {
      throw Exception('Error ${response.statusCode}');
    }

    final decoded = json.decode(response.body) as Map<String, dynamic>;
    final stories = decoded['stories'] as List<dynamic>? ?? [];
    return stories.map((e) => RaceStory.fromJson(e as Map<String, dynamic>)).toList();
  }
}

class RaceStory {
  RaceStory({
    required this.storyId,
    required this.type,
    required this.participant,
    required this.description,
    required this.clipUrl,
    required this.fileUrl,
  });

  final String storyId;
  final String type;
  final Participant participant;
  final String description;
  final String clipUrl;
  final String fileUrl;

  factory RaceStory.fromJson(Map<String, dynamic> json) {
    return RaceStory(
      storyId: json['storyId']?.toString() ?? '',
      type: json['type']?.toString() ?? '',
      participant: Participant.fromJson(json['participant'] as Map<String, dynamic>? ?? {}),
      description: json['description']?.toString() ?? '',
      clipUrl: json['clipUrl']?.toString() ?? '',
      fileUrl: json['fileUrl']?.toString() ?? '',
    );
  }
}

class Participant {
  Participant({
    required this.fullName,
    required this.eventId,
    required this.dorsal,
    required this.team,
    required this.club,
    required this.status,
    required this.realStatus,
    required this.lastSplitSeen,
    required this.lastCheckpoint,
    required this.times,
  });

  final String fullName;
  final String eventId;
  final String dorsal;
  final String team;
  final String club;
  final String status;
  final String realStatus;
  final String lastSplitSeen;
  final String? lastCheckpoint;
  final Map<String, dynamic> times;

  factory Participant.fromJson(Map<String, dynamic> json) {
    final copernico = json['copernicoData'] as Map<String, dynamic>? ?? {};
    return Participant(
      fullName: json['fullName']?.toString() ?? 'Desconocido',
      eventId: json['eventId']?.toString() ?? '',
      dorsal: json['dorsal']?.toString() ?? '',
      team: json['team']?.toString() ?? '',
      club: json['club']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      realStatus: json['realStatus']?.toString() ?? '',
      lastSplitSeen: json['lastSplitSeen']?.toString() ?? json['last_split_seen']?.toString() ?? '',
      lastCheckpoint: (json['lastCheckpoint'] as Map<String, dynamic>?)?['location']?.toString(),
      times: copernico['times'] as Map<String, dynamic>? ?? {},
    );
  }
}

class RaceFeedItem {
  RaceFeedItem({
    required this.eventName,
    required this.stage,
    required this.status,
    required this.statusLabel,
    required this.athleteName,
    required this.team,
    required this.netSplitTime,
    required this.nextTimingPoint,
    required this.raceTime,
    required this.likes,
    required this.comments,
    required this.reposts,
    required this.bib,
    required this.podiums,
    required this.rank,
    required this.imageUrl,
    required this.clipUrl,
    required this.fileUrl,
  });

  final String eventName;
  final String stage;
  final String status;
  final String statusLabel;
  final String athleteName;
  final String team;
  final String netSplitTime;
  final String nextTimingPoint;
  final String raceTime;
  final int likes;
  final int comments;
  final int reposts;
  final String bib;
  final int podiums;
  final int rank;
  final String imageUrl;
  final String clipUrl;
  final String fileUrl;

  String get initials {
    final parts = athleteName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '';
    if (parts.length == 1) {
      final word = parts.first;
      final take = word.length >= 2 ? 2 : word.length;
      return word.substring(0, take).toUpperCase();
    }
    final first = parts.first[0];
    final last = parts.last[0];
    return (first + last).toUpperCase();
  }

  factory RaceFeedItem.fromStory(RaceStory story, int index) {
    final participant = story.participant;
    final latestSplit = _latestSplit(participant.times);
    final netSplitTime = _formatTimeMs(latestSplit?.netTime);
    final raceTime = _formatTimeMs(latestSplit?.netTime);
    final nextTimingPoint =
        participant.lastCheckpoint ?? (participant.lastSplitSeen.isNotEmpty ? participant.lastSplitSeen : 'Next split');

    return RaceFeedItem(
      eventName: participant.eventId.isNotEmpty ? participant.eventId : 'Evento',
      stage: participant.eventId.isNotEmpty ? participant.eventId : 'Stage',
      status: _mapStatus(story.type, participant.realStatus),
      statusLabel: _statusLabel(story.type, participant.realStatus),
      athleteName: participant.fullName,
      team: participant.club.isNotEmpty ? participant.club : participant.team,
      netSplitTime: netSplitTime,
      nextTimingPoint: nextTimingPoint,
      raceTime: raceTime,
      likes: 0,
      comments: 0,
      reposts: 0,
      bib: participant.dorsal.isNotEmpty ? participant.dorsal : '-',
      podiums: 0,
      rank: 0,
      imageUrl: _coverForIndex(index),
      clipUrl: story.clipUrl,
      fileUrl: story.fileUrl,
    );
  }
}

class AppColors {
  static const Color background = Color(0xFF0E0B12);
  static const Color card = Color(0xFF17131B);
  static const Color primary = Color(0xFFE6006F);
  static const Color accentOrange = Color(0xFFEF5030);
  static const Color navBar = Color(0xFF120E15);
}

String _formatCount(int value) {
  if (value >= 1000000) {
    return '${(value / 1000000).toStringAsFixed(1)}m';
  }
  if (value >= 1000) {
    return '${(value / 1000).toStringAsFixed(1)}k';
  }
  return value.toString();
}

class _SplitData {
  _SplitData({required this.name, required this.netTime});
  final String name;
  final int? netTime;
}

_SplitData? _latestSplit(Map<String, dynamic> times) {
  if (times.isEmpty) return null;
  _SplitData? latest;
  int highestOrder = -1;
  times.forEach((key, value) {
    final map = value as Map<String, dynamic>;
    final order = map['order'] is int ? map['order'] as int : int.tryParse(map['order']?.toString() ?? '') ?? -1;
    if (order >= highestOrder) {
      highestOrder = order;
      latest = _SplitData(
        name: key,
        netTime: map['netTime'] is int ? map['netTime'] as int : int.tryParse(map['netTime']?.toString() ?? ''),
      );
    }
  });
  return latest;
}

String _formatTimeMs(int? milliseconds) {
  if (milliseconds == null) return '--:--:--';
  final duration = Duration(milliseconds: milliseconds);
  String two(int n) => n.toString().padLeft(2, '0');
  final hours = duration.inHours;
  final minutes = duration.inMinutes.remainder(60);
  final seconds = duration.inSeconds.remainder(60);
  return '${two(hours)}:${two(minutes)}:${two(seconds)}';
}

String _coverForIndex(int index) {
  const covers = [
    'https://images.unsplash.com/photo-1508606572321-901ea443707f?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1521417531039-5c61118d2b82?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1518806118471-f28b20a1d79d?auto=format&fit=crop&w=1400&q=80',
  ];
  return covers[index % covers.length];
}

String _mapStatus(String type, String realStatus) {
  if (type == 'ATHLETE_FINISHED' || realStatus == 'finished') return 'Finished';
  if (realStatus == 'live' || realStatus == 'running') return 'Live';
  return realStatus.isNotEmpty ? realStatus : 'Status';
}

String _statusLabel(String type, String realStatus) {
  if (type == 'ATHLETE_FINISHED' || realStatus == 'finished') return 'Finished! Race time';
  if (realStatus == 'live' || realStatus == 'running') return 'En carrera';
  return 'Estado';
}
