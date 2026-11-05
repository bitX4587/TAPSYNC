import type { PublicProfileDto } from '@tapsync/shared';
import { ProfileHeader } from './ProfileHeader';
import { LinkCard } from './LinkCard';
import { EmptyState } from './EmptyState';
import { SaveToNetworkButton } from './SaveToNetworkButton';
import { SaveContactButton } from './SaveContactButton';
import { ViewBeacon } from './ViewBeacon';
import { Footer } from './Footer';

interface ProfilePageProps {
  profile: PublicProfileDto;
}

export function ProfilePage({ profile }: ProfilePageProps) {
  const hasLinks = (profile.links ?? []).length > 0;

  return (
    <div className="profile-page">
      <ViewBeacon publicId={profile.publicId} mode={profile.mode} />
      
      <main className="profile-container">
        <ProfileHeader profile={profile} />
        
        <div className="profile-actions">
          <SaveContactButton publicId={profile.publicId} mode={profile.mode} />
          <SaveToNetworkButton publicId={profile.publicId} />
        </div>

        {hasLinks ? (
          <section className="links-section" aria-label="Links">
            <div className="links-grid">
              {(profile.links ?? []).map((link) => (
                <LinkCard 
                  key={link.id} 
                  link={link} 
                  publicId={profile.publicId}
                  mode={profile.mode}
                />
              ))}
            </div>
          </section>
        ) : (
          <EmptyState />
        )}
      </main>

      <Footer />
    </div>
  );
}
